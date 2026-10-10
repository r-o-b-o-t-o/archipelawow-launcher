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
    /// Length of the longest SQL update path as worldserver opens it, through its working directory
    /// (...\server\source\...). The core isn't long path aware, so past MAX_PATH the updates fail.
    /// </summary>
    public int LongestSourcePath => _longestSourcePath ??= !Directory.Exists(paths.SourceDir)
        ? 0
        : Directory.EnumerateFiles(paths.SourceDir, "*.sql", SearchOption.AllDirectories)
            .Select(file => file.Length)
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
        using var startBlock = servers.BlockStarts(task);
        var staging = paths.StagingDir;
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
                // logs, databases, and caches such as mod-i-found-your-sword's.
                Directories.Delete(paths.SourceDir);
                Directories.Delete(paths.ServerLicensesDir);
                Directories.MoveInto(Path.Combine(staging, "server"), paths.ServerDir);
                Directories.MoveInto(Path.Combine(staging, "mysql"), paths.MySqlDir);
                MoveOutOfServerBin();
            });

            // The server is installed: a leftover archive only takes space, and deleting the server clears it
            try
            {
                File.Delete(zip);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                Log.Error($"Could not delete {zip}", ex);
            }
        }
        finally
        {
            ForgetServer();
            await Task.Run(() => Directories.DeleteLeftover(staging));
        }

        // For the modules the release adds
        try
        {
            if (configs.ConfigsExist)
                configs.CreateConfigs(overwrite: false);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new IOException($"The server is installed, but creating the configuration of its new modules failed: {ex.Message}", ex);
        }
    }

    /// <summary>
    /// Moves what the servers kept in server\bin when they ran from there: their configuration, whose paths were
    /// relative to it, and mod-i-found-your-sword's cache. For installations and server releases older than server\configs.
    /// </summary>
    public void MoveOutOfServerBin()
    {
        var legacyConfigs = Path.Combine(paths.ServerBin, "configs");
        if (Directory.Exists(legacyConfigs))
        {
            foreach (var file in Directory.GetFiles(legacyConfigs, "*", SearchOption.AllDirectories))
            {
                var relative = Path.GetRelativePath(legacyConfigs, file);
                var target = Path.Combine(paths.ConfigsDir, relative);
                // Mostly a newer release's .conf.dist
                if (File.Exists(target))
                    continue;
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Move(file, target);
                // Right away: once moved, a file interrupted before this would be skipped by the next run
                if (relative.EndsWith(".conf", StringComparison.OrdinalIgnoreCase))
                    configs.RebasePaths(relative, paths.ServerBin, paths.ServerDir);
            }
            Directories.Delete(legacyConfigs);
            Log.Info($"Moved the server configuration to {paths.ConfigsDir}");
        }

        var legacyCache = Path.Combine(paths.ServerBin, "ap_datapackage_cache");
        var cache = Path.Combine(paths.ServerDir, "ap_datapackage_cache");
        if (Directory.Exists(legacyCache) && !Directory.Exists(cache))
            Directory.Move(legacyCache, cache);
        Directories.Delete(legacyCache);
    }

    /// <summary>Deletes server\ and mysql\: the server, and its databases, configuration, client data and logs.</summary>
    public async Task DeleteAsync(TaskRunner task, ServerManager servers)
    {
        EnsureServersStopped(servers);
        using var startBlock = servers.BlockStarts(task);
        task.Stage("Deleting the server");
        try
        {
            await Task.Run(() =>
            {
                Directories.Delete(paths.ServerDir);
                Directories.Delete(paths.MySqlDir);
                // What a failed or cancelled install may have left
                Directories.Delete(paths.DownloadsDir);
                Directories.Delete(paths.StagingDir);
            });
        }
        finally
        {
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
