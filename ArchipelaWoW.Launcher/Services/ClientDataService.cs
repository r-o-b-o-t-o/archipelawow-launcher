using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace ArchipelaWoW.Launcher.Services;

public sealed record ClientDataRelease(string Tag, DateTimeOffset PublishedAt, string AssetName, long Size, string Url);

/// <summary>
/// The dbc, maps, vmaps, mmaps and camera files worldserver reads from its DataDir, either
/// downloaded from wowgaming/client-data or extracted from a 3.3.5a client with the core's tools.
/// </summary>
public sealed class ClientDataService(AppPaths paths, SettingsStore settings, HttpClient http)
{
    const string LatestReleaseUrl = "https://api.github.com/repos/wowgaming/client-data/releases/latest";
    static readonly string[] Folders = ["dbc", "maps", "vmaps", "mmaps", "Cameras"];
    // worldserver refuses to start without these; mmaps and cameras are optional
    static readonly string[] RequiredFolders = ["dbc", "maps", "vmaps"];

    public object GetStatus()
    {
        var folders = Folders.ToDictionary(f => f, f => HasFiles(Path.Combine(paths.DataDir, f)));
        return new
        {
            Version = settings.Current.ClientDataVersion,
            Folders = folders,
            Ready = RequiredFolders.All(f => folders[f]),
        };
    }

    public async Task<ClientDataRelease> GetLatestReleaseAsync(CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var response = await http.GetAsync(LatestReleaseUrl, timeout.Token);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
        var release = document.RootElement;
        var asset = release.GetProperty("assets").EnumerateArray()
            .First(a => a.GetProperty("name").GetString()!.EndsWith(".zip", StringComparison.OrdinalIgnoreCase));
        return new ClientDataRelease(
            release.GetProperty("tag_name").GetString()!,
            release.GetProperty("published_at").GetDateTimeOffset(),
            asset.GetProperty("name").GetString()!,
            asset.GetProperty("size").GetInt64(),
            asset.GetProperty("browser_download_url").GetString()!);
    }

    public async Task DownloadAsync(TaskRunner task, ServerManager servers, CancellationToken token)
    {
        EnsureWorldServerStopped(servers);
        task.Stage("Looking up the latest client data release");
        var release = await GetLatestReleaseAsync(token);

        var downloadDir = Path.Combine(paths.DataDir, ".download");
        Directory.CreateDirectory(downloadDir);
        var zip = Path.Combine(downloadDir, $"{release.Tag}-{release.AssetName}");
        if (!File.Exists(zip) || new FileInfo(zip).Length != release.Size)
        {
            task.Stage($"Downloading {release.AssetName} {release.Tag}");
            await DownloadFileAsync(release.Url, zip + ".part", release.Size, task, token);
            File.Move(zip + ".part", zip, overwrite: true);
        }

        task.Stage("Extracting the client data");
        await InstallAsync(servers, staging => Task.Run(() => ExtractArchive(zip, staging, task, token), token));
        Directory.Delete(downloadDir, recursive: true);
        settings.Update(s => s.ClientDataVersion = release.Tag);
    }

    public async Task ExtractFromClientAsync(TaskRunner task, ServerManager servers, string clientPath, bool generateMmaps,
        CancellationToken token)
    {
        EnsureWorldServerStopped(servers);
        clientPath = Path.GetFullPath(clientPath);
        var clientData = Path.Combine(clientPath, "Data");
        if (!File.Exists(Path.Combine(clientData, "lichking.MPQ")))
            throw new InvalidOperationException($"{clientPath} doesn't look like a WoW 3.3.5a client: Data\\lichking.MPQ is missing.");
        settings.Update(s => s.WowClientPath = clientPath);

        var steps = generateMmaps ? 4 : 3;
        await InstallAsync(servers, async staging =>
        {
            task.Stage($"Extracting DBC files, maps and cameras (1/{steps})");
            await RunExtractorAsync(task, "map_extractor", ["-i", clientPath, "-o", staging], staging, token);

            task.Stage($"Extracting buildings (2/{steps})");
            await RunExtractorAsync(task, "vmap4_extractor", ["-d", clientData], staging, token);

            task.Stage($"Assembling vmaps (3/{steps})");
            Directory.CreateDirectory(Path.Combine(staging, "vmaps"));
            await RunExtractorAsync(task, "vmap4_assembler", ["Buildings", "vmaps"], staging, token);

            if (generateMmaps)
            {
                task.Stage($"Generating mmaps, this takes a few hours (4/{steps})");
                Directory.CreateDirectory(Path.Combine(staging, "mmaps"));
                await RunExtractorAsync(task, "mmaps_generator", ["--config", Path.Combine(paths.ServerBin, "mmaps-config.yaml")],
                    staging, token);
            }
        });

        settings.Update(s => s.ClientDataVersion = "extracted");
    }

    /// <summary>
    /// Has <paramref name="produce"/> write the data folders to a staging directory, and only then replaces
    /// the installed ones with them, so that a failed or cancelled extraction leaves the data as it was.
    /// </summary>
    async Task InstallAsync(ServerManager servers, Func<string, Task> produce)
    {
        var staging = Path.Combine(paths.DataDir, ".staging");
        if (Directory.Exists(staging))
            Directory.Delete(staging, recursive: true);
        Directory.CreateDirectory(staging);
        try
        {
            await produce(staging);
            // Generating mmaps takes hours: a worldserver started meanwhile would hold the old files open,
            // and deleting them would stop halfway
            EnsureWorldServerStopped(servers);
            DeleteDataFolders(Folders);
            foreach (var folder in Folders)
            {
                var source = Path.Combine(staging, folder);
                if (Directory.Exists(source))
                    Directory.Move(source, Path.Combine(paths.DataDir, folder));
            }
        }
        finally
        {
            Directory.Delete(staging, recursive: true);
        }
    }

    async Task RunExtractorAsync(TaskRunner task, string tool, string[] arguments, string workingDirectory, CancellationToken token)
    {
        // Run from where the data goes: vmap4_extractor writes to ./Buildings, and mmaps_generator's config
        // reads maps and vmaps from ./
        var exitCode = await task.RunToolAsync(paths.ServerExe(tool), arguments, workingDirectory, token);
        if (exitCode != 0)
            throw new InvalidOperationException($"{tool} failed with code {exitCode}.");
    }

    async Task DownloadFileAsync(string url, string file, long size, TaskRunner task, CancellationToken token)
    {
        // Resume a previous attempt when the server supports it
        var existing = File.Exists(file) ? new FileInfo(file).Length : 0;
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        if (existing > 0 && existing < size)
            request.Headers.Range = new RangeHeaderValue(existing, null);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        response.EnsureSuccessStatusCode();

        var resumed = response.StatusCode == HttpStatusCode.PartialContent;
        var done = resumed ? existing : 0;
        await using var output = new FileStream(file, resumed ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None,
            1 << 16, useAsync: true);
        await using var input = await response.Content.ReadAsStreamAsync(token);
        var buffer = new byte[1 << 16];
        while (true)
        {
            // A connection that goes quiet would otherwise hang the download forever
            using var stall = CancellationTokenSource.CreateLinkedTokenSource(token);
            stall.CancelAfter(TimeSpan.FromSeconds(60));
            int read;
            try
            {
                read = await input.ReadAsync(buffer, stall.Token);
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested)
            {
                throw new IOException("The download stalled. Start it again to resume where it stopped.");
            }
            if (read == 0)
                break;
            await output.WriteAsync(buffer.AsMemory(0, read), token);
            done += read;
            task.Progress((double)done / size, $"{done >> 20} / {size >> 20} MB");
        }
        if (done != size)
            throw new IOException($"The download ended early ({done >> 20} of {size >> 20} MB). Start it again to resume it.");
    }

    static void ExtractArchive(string zip, string directory, TaskRunner task, CancellationToken token)
    {
        using var archive = ZipFile.OpenRead(zip);
        var root = Path.GetFullPath(directory) + Path.DirectorySeparatorChar;
        var total = archive.Entries.Sum(e => e.Length);
        long done = 0;
        foreach (var entry in archive.Entries)
        {
            token.ThrowIfCancellationRequested();
            var target = Path.GetFullPath(Path.Combine(root, entry.FullName));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Unexpected path in the archive: {entry.FullName}");
            if (entry.FullName.EndsWith('/'))
            {
                Directory.CreateDirectory(target);
                continue;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
            done += entry.Length;
            task.Progress((double)done / total, $"{done >> 20} / {total >> 20} MB");
        }
    }

    void DeleteDataFolders(IEnumerable<string> folders)
    {
        foreach (var folder in folders)
        {
            var path = Path.Combine(paths.DataDir, folder);
            if (Directory.Exists(path))
                Directory.Delete(path, recursive: true);
        }
    }

    static void EnsureWorldServerStopped(ServerManager servers)
    {
        if (servers.WorldServer.IsActive)
            throw new InvalidOperationException("Stop the worldserver first, it keeps the client data files open.");
    }

    static bool HasFiles(string directory) =>
        Directory.Exists(directory) && Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).Any();
}
