using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;

namespace ArchipelaWoW.Launcher.Services;

public static class Downloads
{
    /// <summary>
    /// Downloads to a file unless it's already there, complete, reporting progress to the task. A previous attempt
    /// left in file.part is resumed when the server supports it.
    /// </summary>
    public static async Task DownloadOnceAsync(HttpClient http, string url, string file, long size, TaskRunner task, CancellationToken token)
    {
        if (File.Exists(file) && new FileInfo(file).Length == size)
            return;
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        task.Stage($"Downloading {Path.GetFileName(file)}");
        await DownloadFileAsync(http, url, file + ".part", size, task, token);
        File.Move(file + ".part", file, overwrite: true);
    }

    static async Task DownloadFileAsync(HttpClient http, string url, string file, long size, TaskRunner task, CancellationToken token)
    {
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

    public static void ExtractZip(string zip, string directory, TaskRunner task, CancellationToken token)
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
}
