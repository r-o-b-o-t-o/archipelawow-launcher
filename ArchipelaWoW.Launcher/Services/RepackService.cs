using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace ArchipelaWoW.Launcher.Services;

public sealed record RepackArchive(string Build, string Name, long Size, string Url);

public sealed record RepackRelease(string Version, DateTimeOffset PublishedAt, string Url, IReadOnlyList<RepackArchive> Archives);

/// <summary>
/// The server the launcher runs, server\ and mysql\, installed from an archipelawow-repack release. A release
/// has an archive per build, ArchipelaWoW-Repack-&lt;build&gt;-&lt;version&gt;.zip, and the installed one's
/// server\release.json gives its version and build.
/// </summary>
public sealed partial class RepackService(AppPaths paths, SettingsStore settings, ConfigService configs, HttpClient http)
{
    const string Repository = "r-o-b-o-t-o/archipelawow-repack";

    public const int MaxPath = 259;

    int? _longestSourcePath;

    public bool IsInstalled => File.Exists(paths.ServerExe("worldserver")) && File.Exists(paths.MySqlExe("mysqld"));

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
    public JsonNode? ReadManifest()
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

    public async Task<RepackRelease> GetLatestReleaseAsync(CancellationToken token)
    {
        var release = await GitHub.GetLatestReleaseAsync(http, Repository, token);
        var archives = release.Assets
            .Select(asset => (Asset: asset, Match: ArchiveName().Match(asset.Name)))
            .Where(a => a.Match.Success)
            .Select(a => new RepackArchive(a.Match.Groups["build"].Value, a.Asset.Name, a.Asset.Size, a.Asset.Url))
            .ToList();
        return new RepackRelease(release.Tag.TrimStart('v'), release.PublishedAt, release.Url, archives);
    }

    /// <summary>Installs a build of the latest release, over the installed server if there is one.</summary>
    public async Task InstallAsync(TaskRunner task, ServerManager servers, string build, CancellationToken token)
    {
        EnsureServersStopped(servers);
        task.Stage("Looking up the latest server release");
        var release = await GetLatestReleaseAsync(token);
        var archive = release.Archives.FirstOrDefault(a => a.Build == build)
            ?? throw new InvalidOperationException($"The latest server release has no {build} build.");

        Directory.CreateDirectory(paths.DownloadsDir);
        var zip = Path.Combine(paths.DownloadsDir, archive.Name);
        if (!File.Exists(zip) || new FileInfo(zip).Length != archive.Size)
        {
            task.Stage($"Downloading {archive.Name}");
            await Downloads.DownloadFileAsync(http, archive.Url, zip + ".part", archive.Size, task, token);
            File.Move(zip + ".part", zip, overwrite: true);
        }

        // Extracted aside first, so that a failed or cancelled extraction leaves the installed server as it was
        var staging = Path.Combine(paths.LauncherDir, "staging");
        DeleteDirectory(staging);
        try
        {
            task.Stage("Extracting the server");
            await Task.Run(() => Downloads.ExtractZip(zip, staging, task, token), token);
            if (!File.Exists(Path.Combine(staging, "server", "bin", "worldserver.exe")))
                throw new InvalidDataException($"{archive.Name} has no server\\bin\\worldserver.exe.");

            task.Stage("Installing the server");
            // Servers started meanwhile would keep their files open
            EnsureServersStopped(servers);
            // An update left from the previous release would confuse the database updater when AzerothCore renames it.
            // The rest is overwritten, keeping what the servers and the user made: configuration, client data, logs,
            // databases, and caches such as mod-i-found-your-sword's in server\bin.
            DeleteDirectory(paths.SourceDir);
            DeleteDirectory(paths.ServerLicensesDir);
            MoveInto(staging, paths.Root);
        }
        finally
        {
            DeleteDirectory(staging);
            _longestSourcePath = null;
        }
        File.Delete(zip);

        // For the modules the release adds
        if (configs.ConfigsExist)
            configs.CreateConfigs(overwrite: false);
    }

    /// <summary>Deletes server\ and mysql\: the server, and its databases, configuration, client data and logs.</summary>
    public async Task DeleteAsync(TaskRunner task, ServerManager servers, CancellationToken token)
    {
        EnsureServersStopped(servers);
        task.Stage("Deleting the server");
        try
        {
            await Task.Run(() =>
            {
                DeleteDirectory(paths.ServerDir);
                DeleteDirectory(paths.MySqlDir);
            }, token);
        }
        finally
        {
            _longestSourcePath = null;
            settings.Update(s =>
            {
                s.DatabaseInitialized = false;
                s.ClientDataVersion = null;
            });
        }
    }

    static void EnsureServersStopped(ServerManager servers)
    {
        if (servers.AnyActive)
            throw new InvalidOperationException("Stop the servers first, they keep their files open.");
    }

    // Links, such as the junctions of a development installation, go without what they point to. Directory.Delete
    // alone does that too, but throws on the junctions it finds inside when not elevated.
    static void DeleteDirectory(string directory)
    {
        var info = new DirectoryInfo(directory);
        if (!info.Exists)
            return;
        if (info.LinkTarget == null)
        {
            foreach (var child in info.EnumerateDirectories())
                DeleteDirectory(child.FullName);
        }
        info.Delete(recursive: true);
    }

    // Merges a directory into another, replacing the files they share. A link in the way is replaced rather than
    // written through.
    static void MoveInto(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.EnumerateFiles(source))
            File.Move(file, Path.Combine(destination, Path.GetFileName(file)), overwrite: true);
        foreach (var directory in Directory.EnumerateDirectories(source))
        {
            var target = Path.Combine(destination, Path.GetFileName(directory));
            if (new DirectoryInfo(target).LinkTarget != null)
                Directory.Delete(target);
            if (Directory.Exists(target))
                MoveInto(directory, target);
            else
                Directory.Move(directory, target);
        }
    }

    [GeneratedRegex(@"^ArchipelaWoW-Repack-(?<build>.+)-\d+(\.\d+)+\.zip$")]
    private static partial Regex ArchiveName();
}
