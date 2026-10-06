using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;

namespace ArchipelaWoW.Launcher.Services;

public sealed record GitHubAsset(string Name, long Size, string Url);

public sealed record GitHubRelease(string Tag, DateTimeOffset PublishedAt, IReadOnlyList<GitHubAsset> Assets);

public static class GitHub
{
    // GitHub answers 60 lookups an hour without signing in, and each visit to the setup or the settings makes two
    static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    static readonly ConcurrentDictionary<string, (DateTimeOffset At, GitHubRelease Release)> LatestReleases = new();

    /// <summary>The latest release of a repository ("owner/name"), pre-releases left out.</summary>
    public static async Task<GitHubRelease> GetLatestReleaseAsync(HttpClient http, string repository, CancellationToken token)
    {
        if (LatestReleases.TryGetValue(repository, out var cached) && DateTimeOffset.Now - cached.At < CacheDuration)
            return cached.Release;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var response = await http.GetAsync($"https://api.github.com/repos/{repository}/releases/latest", timeout.Token);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException($"{repository} has no release yet.");
        if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
            throw new InvalidOperationException("GitHub refuses more lookups for now, try again in an hour.");
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
        var release = document.RootElement;
        var latest = new GitHubRelease(
            release.GetProperty("tag_name").GetString()!,
            release.GetProperty("published_at").GetDateTimeOffset(),
            release.GetProperty("assets").EnumerateArray()
                .Select(a => new GitHubAsset(
                    a.GetProperty("name").GetString()!,
                    a.GetProperty("size").GetInt64(),
                    a.GetProperty("browser_download_url").GetString()!))
                .ToList());
        LatestReleases[repository] = (DateTimeOffset.Now, latest);
        return latest;
    }
}
