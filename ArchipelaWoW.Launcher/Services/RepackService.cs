using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace ArchipelaWoW.Launcher.Services;

public sealed record RepackArchive(string Build, string Name, long Size, string Url);

public sealed record RepackRelease(string Version, DateTimeOffset PublishedAt, IReadOnlyList<RepackArchive> Archives);

/// <summary>
/// The server the launcher runs, server\ and mysql\, installed from an archipelawow-repack release. A release
/// has an archive per build, ArchipelaWoW-Repack-&lt;build&gt;-&lt;version&gt;.zip, and the installed one's
/// server\release.json gives its version and build.
/// </summary>
public sealed partial class RepackService(AppPaths paths, SettingsStore settings, ConfigService configs, HttpClient http)
{
    const string Repository = "r-o-b-o-t-o/archipelawow-repack";

    public const int MaxPath = 259;

    // Read once until the server is installed or deleted
    int? _longestSourcePath;
    JsonNode? _manifest;
    bool _manifestRead;

    public bool IsInstalled => HasServer(paths);

    /// <summary>
    /// Length of the longest SQL update path as worldserver opens it: the full path, through its working
    /// directory (...\server\bin\..\source\...). The core isn't long path aware, so past MAX_PATH the updates fail.
    /// </summary>
    public int LongestSourcePath => _longestSourcePath ??= !Directory.Exists(paths.SourceDir)
        ? 0
        : Path.Combine(paths.ServerBin, "..", "source").Length + Directory
            .EnumerateFiles(paths.SourceDir, "*.sql", SearchOption.AllDirectories)
            .Select(file => file.Length - paths.SourceDir.Length)
            .DefaultIfEmpty(0)
            .Max();

    /// <summary>server\release.json, written by the repack workflow: the version and build, and what they were built from.</summary>
    public JsonNode? Manifest
    {
        get
        {
            if (!_manifestRead)
            {
                _manifest = ReadManifest();
                _manifestRead = true;
            }
            return _manifest;
        }
    }

    public async Task<RepackRelease> GetLatestReleaseAsync(CancellationToken token)
    {
        var release = await GitHub.GetLatestReleaseAsync(http, Repository, token);
        var archives = release.Assets
            .Select(asset => (Asset: asset, Match: ArchiveName().Match(asset.Name)))
            .Where(a => a.Match.Success)
            .Select(a => new RepackArchive(a.Match.Groups["build"].Value, a.Asset.Name, a.Asset.Size, a.Asset.Url))
            .ToList();
        return new RepackRelease(release.Tag.TrimStart('v'), release.PublishedAt, archives);
    }

    /// <summary>Installs a build of the latest release, over the installed server if there is one.</summary>
    public async Task InstallAsync(TaskRunner task, ServerManager servers, string build, CancellationToken token)
    {
        EnsureServersStopped(servers);
        servers.StartBlockedReason = $"Wait for \"{task.Current?.Title}\" to finish first.";
        var staging = Path.Combine(paths.LauncherDir, "staging");
        try
        {
            task.Stage("Looking up the latest server release");
            var release = await GetLatestReleaseAsync(token);
            var archive = release.Archives.FirstOrDefault(a => a.Build == build)
                ?? throw new InvalidOperationException($"The latest server release has no {build} build.");
            var zip = Path.Combine(paths.DownloadsDir, archive.Name);
            await Downloads.DownloadOnceAsync(http, archive.Url, zip, archive.Size, task, token);

            // Extracted aside first, so that a failed or cancelled extraction leaves the installed server as it was
            task.Stage("Extracting the server");
            await Task.Run(() =>
            {
                Directories.Delete(staging);
                Downloads.ExtractZip(zip, staging, task, token);
            }, token);
            if (!HasServer(new AppPaths(staging)))
                throw new InvalidDataException($"{archive.Name} has no server: server\\bin\\worldserver.exe or mysql\\bin\\mysqld.exe is missing.");

            task.Stage("Installing the server");
            await Task.Run(() =>
            {
                // An update left from the previous release would confuse the database updater when AzerothCore renames
                // it. The rest is overwritten, keeping what the servers and the user made: configuration, client data,
                // logs, databases, and caches such as mod-i-found-your-sword's in server\bin.
                Directories.Delete(paths.SourceDir);
                Directories.Delete(paths.ServerLicensesDir);
                Directories.MoveInto(Path.Combine(staging, "server"), paths.ServerDir);
                Directories.MoveInto(Path.Combine(staging, "mysql"), paths.MySqlDir);
            });
            File.Delete(zip);
        }
        finally
        {
            await Task.Run(() => Directories.Delete(staging));
            servers.StartBlockedReason = null;
            ForgetServer();
        }

        // For the modules the release adds
        if (configs.ConfigsExist)
            configs.CreateConfigs(overwrite: false);
    }

    /// <summary>Deletes server\ and mysql\: the server, and its databases, configuration, client data and logs.</summary>
    public async Task DeleteAsync(TaskRunner task, ServerManager servers)
    {
        EnsureServersStopped(servers);
        servers.StartBlockedReason = $"Wait for \"{task.Current?.Title}\" to finish first.";
        task.Stage("Deleting the server");
        try
        {
            await Task.Run(() =>
            {
                Directories.Delete(paths.ServerDir);
                Directories.Delete(paths.MySqlDir);
                // Archives left by a failed or cancelled install
                Directories.Delete(paths.DownloadsDir);
            });
        }
        finally
        {
            servers.StartBlockedReason = null;
            ForgetServer();
            settings.Update(s =>
            {
                s.DatabaseInitialized = false;
                s.ClientDataVersion = null;
            });
        }
    }

    static bool HasServer(AppPaths at) => File.Exists(at.ServerExe("worldserver")) && File.Exists(at.MySqlExe("mysqld"));

    JsonNode? ReadManifest()
    {
        if (!File.Exists(paths.ManifestFile))
            return null;
        try
        {
            return JsonNode.Parse(File.ReadAllText(paths.ManifestFile));
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            Log.Error("Ignoring unreadable release.json", ex);
            return null;
        }
    }

    void ForgetServer()
    {
        _longestSourcePath = null;
        _manifestRead = false;
    }

    static void EnsureServersStopped(ServerManager servers)
    {
        if (servers.AnyActive)
            throw new InvalidOperationException("Stop the servers first, they keep their files open.");
    }

    [GeneratedRegex(@"^ArchipelaWoW-Repack-(?<build>.+)-\d+(\.\d+)+\.zip$")]
    private static partial Regex ArchiveName();
}
