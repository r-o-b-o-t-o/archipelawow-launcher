using System.Net;
using System.Text.Json;

namespace ArchipelaWoW.Launcher.Services;

public sealed record GitHubAsset(string Name, long Size, string Url);

public sealed record GitHubRelease(string Tag, DateTimeOffset PublishedAt, string Url, IReadOnlyList<GitHubAsset> Assets);

public static class GitHub
{
    /// <summary>The latest release of a repository ("owner/name"), pre-releases left out.</summary>
    public static async Task<GitHubRelease> GetLatestReleaseAsync(HttpClient http, string repository, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var response = await http.GetAsync($"https://api.github.com/repos/{repository}/releases/latest", timeout.Token);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException($"{repository} has no release yet.");
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
        var release = document.RootElement;
        return new GitHubRelease(
            release.GetProperty("tag_name").GetString()!,
            release.GetProperty("published_at").GetDateTimeOffset(),
            release.GetProperty("html_url").GetString()!,
            release.GetProperty("assets").EnumerateArray()
                .Select(a => new GitHubAsset(
                    a.GetProperty("name").GetString()!,
                    a.GetProperty("size").GetInt64(),
                    a.GetProperty("browser_download_url").GetString()!))
                .ToList());
    }
}
