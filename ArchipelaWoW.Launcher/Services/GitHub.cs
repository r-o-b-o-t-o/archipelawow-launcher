using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;

namespace ArchipelaWoW.Launcher.Services;

public sealed record GitHubAsset(string Name, long Size, string Url);

public sealed record GitHubRelease(string Tag, bool Prerelease, DateTimeOffset PublishedAt, IReadOnlyList<GitHubAsset> Assets);

public static class GitHub
{
    public const string RateLimitedMessage = "GitHub refuses more lookups for now, try again in an hour.";

    // GitHub answers 60 lookups an hour without signing in, and each visit to the setup makes two, to the settings three
    // with LauncherUpdater's, to the APWorld page one
    static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    static readonly ConcurrentDictionary<string, (DateTimeOffset At, GitHubRelease Release)> LatestReleases = new();
    static readonly ConcurrentDictionary<string, (DateTimeOffset At, IReadOnlyList<GitHubRelease> Releases)> AllReleases = new();

    /// <summary>The latest release of a repository ("owner/name"), pre-releases left out.</summary>
    public static async Task<GitHubRelease> GetLatestReleaseAsync(HttpClient http, string repository, CancellationToken token)
    {
        if (LatestReleases.TryGetValue(repository, out var cached) && DateTimeOffset.Now - cached.At < CacheDuration)
            return cached.Release;

        using var document = await GetAsync(http, $"repos/{repository}/releases/latest", repository, token);
        var latest = ParseRelease(document.RootElement);
        LatestReleases[repository] = (DateTimeOffset.Now, latest);
        return latest;
    }

    /// <summary>The last 30 releases of a repository ("owner/name"), pre-releases included, newest first.</summary>
    public static async Task<IReadOnlyList<GitHubRelease>> GetReleasesAsync(HttpClient http, string repository, CancellationToken token)
    {
        if (AllReleases.TryGetValue(repository, out var cached) && DateTimeOffset.Now - cached.At < CacheDuration)
            return cached.Releases;

        using var document = await GetAsync(http, $"repos/{repository}/releases", repository, token);
        var releases = document.RootElement.EnumerateArray()
            .Where(r => !r.GetProperty("draft").GetBoolean())
            .Select(ParseRelease)
            .ToList();
        AllReleases[repository] = (DateTimeOffset.Now, releases);
        return releases;
    }

    static async Task<JsonDocument> GetAsync(HttpClient http, string path, string repository, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var response = await http.GetAsync($"https://api.github.com/{path}", timeout.Token);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException($"{repository} has no release yet.");
        if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
            throw new InvalidOperationException(RateLimitedMessage);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
    }

    static GitHubRelease ParseRelease(JsonElement release) => new(
        release.GetProperty("tag_name").GetString()!,
        release.GetProperty("prerelease").GetBoolean(),
        release.GetProperty("published_at").GetDateTimeOffset(),
        release.GetProperty("assets").EnumerateArray()
            .Select(a => new GitHubAsset(
                a.GetProperty("name").GetString()!,
                a.GetProperty("size").GetInt64(),
                a.GetProperty("browser_download_url").GetString()!))
            .ToList());
}
