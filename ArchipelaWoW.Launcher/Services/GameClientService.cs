using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Text.RegularExpressions;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// The stock World of Warcraft 3.3.5a (12340) client: downloaded from a directory listing holding every locale,
/// and started on the local realm or the realmlist the user chose.
/// </summary>
public sealed partial class GameClientService(AppPaths paths, SettingsStore settings, ConfigService configs, HttpClient http)
{
    // Its https address redirects here, and HttpClient doesn't follow a redirect from https to http
    static readonly Uri Source = new("http://heyitsbench.aether.feralhosting.com/WoW%203.3.5%2012340/");
    const string Executable = "Wow.exe";
    const int DefaultAuthServerPort = 3724;

    // Set before checking that the game isn't running, so that it can't start after the check either
    volatile bool _deleting;

    public bool IsInstalled => File.Exists(ExecutablePath);

    string ExecutablePath => Path.Combine(paths.GameClientDir, Executable);

    /// <summary>The realmlist.wtf address of the local realm: the port only when it isn't the client's default.</summary>
    public string LocalRealmlist =>
        configs.AuthServerPort == DefaultAuthServerPort ? "127.0.0.1" : $"127.0.0.1:{configs.AuthServerPort}";

    public object GetStatus() => new
    {
        Installed = IsInstalled,
        Path = paths.GameClientDir,
        Locale = IsInstalled ? FindLocale() : null,
        // The locale of a download that stopped halfway, which downloading again resumes: starting one in another
        // locale deletes it
        PartialDownload = PartialDownloads().FirstOrDefault(),
        Realmlist = settings.Current.GameRealmlist,
        LocalRealmlist,
    };

    public async Task<List<string>> GetLocalesAsync(CancellationToken token)
    {
        var entries = await ListAsync(new Uri(Source, "Data/"), token);
        return entries.Where(e => e.IsDirectory && LocaleRegex().IsMatch(e.Name)).Select(e => e.Name).Order().ToList();
    }

    public async Task DownloadAsync(TaskRunner task, string locale, CancellationToken token)
    {
        if (!LocaleRegex().IsMatch(locale))
            throw new ArgumentException($"Unknown locale {locale}.");
        if (IsInstalled)
            throw new InvalidOperationException("The game client is already downloaded: delete it first.");

        task.Stage("Listing the game client's files");
        var files = await ListFilesAsync(locale, token);
        if (!files.Any(f => f.Path.Equals(Executable, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException($"The download has no {Executable}: its listing may have changed.");
        if (!files.Any(f => f.Path.StartsWith(Path.Combine("Data", locale) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException($"The download has no {locale} locale.");

        task.Stage("Measuring the game client's files");
        var sizes = new long[files.Count];
        var measured = 0;
        await Parallel.ForEachAsync(Enumerable.Range(0, files.Count),
            new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = token },
            async (i, t) =>
            {
                sizes[i] = await GetSizeAsync(files[i].Url, t);
                var count = Interlocked.Increment(ref measured);
                task.Progress((double)count / files.Count, $"{count} / {files.Count} files");
            });

        // A download started in another locale would be of no use
        await Task.Run(() =>
        {
            foreach (var other in PartialDownloads().Where(l => l != locale))
                Directories.Delete(Path.Combine(paths.GameClientDownloadDir, other));
        }, token);

        var staging = Path.GetFullPath(Path.Combine(paths.GameClientDownloadDir, locale));
        var root = staging + Path.DirectorySeparatorChar;
        var total = Math.Max(1, sizes.Sum());
        task.Stage($"Downloading the game client ({total / (double)(1 << 30):0.0} GB)");
        long done = 0;
        for (var i = 0; i < files.Count; i++)
        {
            var (url, path) = files[i];
            var target = Path.GetFullPath(Path.Combine(root, path));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Unexpected path in the listing: {path}");
            var before = done;
            await Downloads.DownloadOnceAsync(http, url.AbsoluteUri, target, sizes[i],
                read => task.Progress((double)(before + read) / total, $"{path}, {(before + read) >> 20} / {total >> 20} MB"), token);
            done += sizes[i];
            // Files already downloaded report nothing
            task.Progress((double)done / total, $"{path}, {done >> 20} / {total >> 20} MB");
        }

        task.Stage("Installing the game client");
        await Task.Run(() =>
        {
            // What a failed deletion may have left
            Directories.Delete(paths.GameClientDir);
            Directory.Move(staging, paths.GameClientDir);
            Directories.Delete(paths.GameClientDownloadDir);
        }, CancellationToken.None);
    }

    public async Task DeleteAsync(TaskRunner task)
    {
        _deleting = true;
        try
        {
            if (IsRunning())
                throw new InvalidOperationException("Quit the game first.");
            task.Stage("Deleting the game client");
            await Task.Run(() =>
            {
                Directories.Delete(paths.GameClientDir);
                Directories.Delete(paths.GameClientDownloadDir);
            });
        }
        finally
        {
            _deleting = false;
        }
    }

    /// <summary>Points the client at the realmlist, saved for next time, or the local realm when empty, and starts it.</summary>
    public void Play(string? realmlist)
    {
        if (_deleting)
            throw new InvalidOperationException("The game client is being deleted.");
        if (!IsInstalled)
            throw new InvalidOperationException("Download the game client first.");
        realmlist = string.IsNullOrWhiteSpace(realmlist) ? null : realmlist.Trim();
        if (realmlist != null && !RealmlistRegex().IsMatch(realmlist))
            throw new ArgumentException("Enter a host name or address, followed by :port if need be.");
        var locale = FindLocale() ?? throw new InvalidOperationException("The game client has no locale folder in Data.");

        settings.Update(s => s.GameRealmlist = realmlist);
        File.WriteAllText(Path.Combine(paths.GameClientDir, "Data", locale, "realmlist.wtf"),
            $"set realmlist {realmlist ?? LocalRealmlist}\r\n");
        Process.Start(new ProcessStartInfo(ExecutablePath) { WorkingDirectory = paths.GameClientDir })?.Dispose();
    }

    string? FindLocale()
    {
        var data = Path.Combine(paths.GameClientDir, "Data");
        return Directory.Exists(data)
            ? Directory.EnumerateDirectories(data).Select(d => Path.GetFileName(d)).FirstOrDefault(n => LocaleRegex().IsMatch(n!))
            : null;
    }

    List<string> PartialDownloads() =>
        Directory.Exists(paths.GameClientDownloadDir)
            ? Directory.EnumerateDirectories(paths.GameClientDownloadDir).Select(d => Path.GetFileName(d)).ToList()
            : [];

    /// <summary>Whether the downloaded client is running.</summary>
    public bool IsRunning()
    {
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Executable)))
        {
            using (process)
            {
                try
                {
                    if (string.Equals(process.MainModule?.FileName, ExecutablePath, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch (Exception ex) when (ex is Win32Exception or InvalidOperationException)
                {
                    // Exited meanwhile, or not ours to inspect
                }
            }
        }
        return false;
    }

    /// <summary>Every file of the client, by its path in the client's folder, leaving out the locales not chosen.</summary>
    async Task<List<(Uri Url, string Path)>> ListFilesAsync(string locale, CancellationToken token)
    {
        var files = new List<(Uri, string)>();
        var pending = new Stack<(Uri Url, string Path)>([(Source, "")]);
        while (pending.TryPop(out var directory))
        {
            foreach (var entry in await ListAsync(directory.Url, token))
            {
                var path = Path.Combine(directory.Path, entry.Name);
                if (!entry.IsDirectory)
                    files.Add((entry.Url, path));
                else if (!IsSkipped(directory.Path, entry.Name))
                    pending.Push((entry.Url, path));
            }
        }
        return files;

        bool IsSkipped(string parent, string name) =>
            // The macOS client
            name.EndsWith(".app", StringComparison.OrdinalIgnoreCase)
            || (parent.Equals("Data", StringComparison.OrdinalIgnoreCase) && LocaleRegex().IsMatch(name) && name != locale);
    }

    sealed record Entry(Uri Url, string Name, bool IsDirectory);

    /// <summary>The files and folders a directory listing links to, leaving out its parent and sorting links.</summary>
    async Task<List<Entry>> ListAsync(Uri directory, CancellationToken token)
    {
        var html = await WithTimeoutAsync(t => http.GetStringAsync(directory, t), token);
        var prefix = directory.AbsoluteUri;
        var entries = new Dictionary<string, Entry>();
        foreach (Match match in HrefRegex().Matches(html))
        {
            var href = WebUtility.HtmlDecode(match.Groups[1].Value);
            if (href.Contains('?') || href.Contains('#') || !Uri.TryCreate(directory, href, out var url))
                continue;
            var absolute = url.AbsoluteUri;
            if (!absolute.StartsWith(prefix, StringComparison.Ordinal) || absolute.Length == prefix.Length)
                continue;
            var relative = absolute[prefix.Length..];
            var isDirectory = relative.EndsWith('/');
            var name = Uri.UnescapeDataString(relative.TrimEnd('/'));
            if (name.Contains('/') || name is "." or ".." || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                continue;
            entries.TryAdd(absolute, new Entry(url, name, isDirectory));
        }
        return entries.Values.ToList();
    }

    async Task<long> GetSizeAsync(Uri url, CancellationToken token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Head, url);
        using var response = await WithTimeoutAsync(t => http.SendAsync(request, t), token);
        response.EnsureSuccessStatusCode();
        return response.Content.Headers.ContentLength
            ?? throw new InvalidDataException($"The server doesn't tell the size of {Uri.UnescapeDataString(url.AbsolutePath)}.");
    }

    /// <summary>Gives up on a server that doesn't answer, as a failure: the task runner reports a cancellation as the user's.</summary>
    static async Task<T> WithTimeoutAsync<T>(Func<CancellationToken, Task<T>> request, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            return await request(timeout.Token);
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            throw new TimeoutException("The game client's download server didn't answer, try again later.");
        }
    }

    [GeneratedRegex("^[a-z]{2}[A-Z]{2}$")]
    private static partial Regex LocaleRegex();

    [GeneratedRegex("""href\s*=\s*["']([^"']+)["']""", RegexOptions.IgnoreCase)]
    private static partial Regex HrefRegex();

    [GeneratedRegex(@"^[A-Za-z0-9.\-]+(:\d{1,5})?$")]
    private static partial Regex RealmlistRegex();
}
