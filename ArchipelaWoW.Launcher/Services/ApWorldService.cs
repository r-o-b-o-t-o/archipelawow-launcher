using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace ArchipelaWoW.Launcher.Services;

public sealed record ArchipelagoInstallation(string Path, string? Version);

public sealed record InstalledApWorld(string File, string? WorldVersion);

public sealed record ApWorldRelease(string Tag, bool Prerelease, DateTimeOffset PublishedAt, string AssetName, long Size, string Url);

/// <summary>The ArchipelaWoW apworld in the custom worlds of the Archipelago launcher installed on this computer.</summary>
public sealed partial class ApWorldService(HttpClient http)
{
    const string Repository = "r-o-b-o-t-o/archipelawow";
    // The apworld's Python package, its top folder
    const string WorldModule = "worldofwarcraft";

    public object GetStatus()
    {
        var archipelago = FindArchipelago();
        return new
        {
            Archipelago = archipelago,
            Installed = archipelago is null ? null : FindInstalledWorlds(archipelago.Path).FirstOrDefault(),
        };
    }

    public async Task<IReadOnlyList<ApWorldRelease>> GetReleasesAsync(CancellationToken token) =>
        (await GitHub.GetReleasesAsync(http, Repository, token))
            .Select(r => (Release: r, Asset: r.Assets.FirstOrDefault(a => a.Name.EndsWith(".apworld", StringComparison.OrdinalIgnoreCase))))
            .Where(r => r.Asset is not null)
            .Select(r => new ApWorldRelease(r.Release.Tag, r.Release.Prerelease, r.Release.PublishedAt, r.Asset!.Name, r.Asset.Size, r.Asset.Url))
            .ToList();

    public async Task InstallAsync(string tag, CancellationToken token)
    {
        var archipelago = FindArchipelago() ?? throw new InvalidOperationException("Install Archipelago first.");
        var release = (await GetReleasesAsync(token)).FirstOrDefault(r => r.Tag == tag)
            ?? throw new ArgumentException($"There is no apworld in release {tag}.");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        var content = await http.GetByteArrayAsync(release.Url, timeout.Token);
        using (var zip = new ZipArchive(new MemoryStream(content)))
        {
            if (!zip.Entries.Any(e => e.FullName.StartsWith(WorldModule + "/")))
                throw new InvalidOperationException($"{release.AssetName} of release {tag} doesn't hold the {WorldModule} world.");
        }

        var folder = CustomWorldsDir(archipelago.Path);
        Directory.CreateDirectory(folder);
        // Written first, so that a failure leaves the installed version in place: Archipelago only loads .apworld files
        var target = Path.Combine(folder, release.AssetName);
        await File.WriteAllBytesAsync(target + ".part", content, token);
        // Archipelago refuses to load a world twice
        foreach (var other in FindInstalledWorlds(archipelago.Path).ToList())
            File.Delete(Path.Combine(folder, other.File));
        File.Move(target + ".part", target, overwrite: true);
    }

    static string CustomWorldsDir(string archipelago) => Path.Combine(archipelago, "custom_worlds");

    static IEnumerable<InstalledApWorld> FindInstalledWorlds(string archipelago)
    {
        var folder = CustomWorldsDir(archipelago);
        if (!Directory.Exists(folder))
            yield break;
        foreach (var file in Directory.EnumerateFiles(folder, "*.apworld"))
        {
            string? version;
            try
            {
                using var zip = ZipFile.OpenRead(file);
                if (!zip.Entries.Any(e => e.FullName.StartsWith(WorldModule + "/")))
                    continue;
                version = ReadWorldVersion(zip);
            }
            catch (Exception ex) when (ex is InvalidDataException or IOException or UnauthorizedAccessException)
            {
                continue;
            }
            yield return new InstalledApWorld(Path.GetFileName(file), version);
        }
    }

    // Older apworlds have no manifest
    static string? ReadWorldVersion(ZipArchive zip)
    {
        if (zip.GetEntry($"{WorldModule}/archipelago.json") is not { } manifest)
            return null;
        try
        {
            using var stream = manifest.Open();
            using var document = JsonDocument.Parse(stream);
            return document.RootElement.TryGetProperty("world_version", out var version) ? version.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>The installation its setup registered, or the one in its default folder.</summary>
    static ArchipelagoInstallation? FindArchipelago()
    {
        foreach (var (hive, view) in new[]
        {
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32),
            (RegistryHive.CurrentUser, RegistryView.Default),
        })
        {
            using var uninstall = RegistryKey.OpenBaseKey(hive, view).OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstall is null)
                continue;
            foreach (var name in uninstall.GetSubKeyNames())
            {
                using var app = uninstall.OpenSubKey(name);
                if (app?.GetValue("DisplayName") is not string displayName ||
                    ArchipelagoNameRegex().Match(displayName) is not { Success: true } match ||
                    app.GetValue("InstallLocation") is not string location ||
                    !IsArchipelago(location))
                    continue;
                return new ArchipelagoInstallation(Path.TrimEndingDirectorySeparator(Path.GetFullPath(location)), match.Groups[1].Value);
            }
        }
        var defaultFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Archipelago");
        return IsArchipelago(defaultFolder) ? new ArchipelagoInstallation(defaultFolder, null) : null;
    }

    static bool IsArchipelago(string folder) => File.Exists(Path.Combine(folder, "ArchipelagoLauncher.exe"));

    [GeneratedRegex(@"^Archipelago (\d+\.\d+\.\d+)")]
    private static partial Regex ArchipelagoNameRegex();
}
