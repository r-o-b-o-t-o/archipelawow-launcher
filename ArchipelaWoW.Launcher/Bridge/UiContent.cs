using System.Reflection;
using Microsoft.Web.WebView2.Core;

namespace ArchipelaWoW.Launcher.Bridge;

/// <summary>Serves the UI embedded at build time (ui/dist) from a virtual origin.</summary>
public static class UiContent
{
    public const string Origin = "https://launcher.archipelawow";

    static readonly Assembly Assembly = typeof(UiContent).Assembly;

    // MSBuild's RecursiveDir puts backslashes in the resource names
    static readonly Dictionary<string, string> Resources = Assembly.GetManifestResourceNames()
        .Where(name => name.StartsWith("ui/"))
        .ToDictionary(name => name[3..].Replace('\\', '/'), name => name, StringComparer.OrdinalIgnoreCase);

    public static bool IsAvailable => Resources.ContainsKey("index.html");

    public static void Attach(CoreWebView2 webView)
    {
        webView.AddWebResourceRequestedFilter(Origin + "/*", CoreWebView2WebResourceContext.All);
        webView.WebResourceRequested += (_, e) =>
        {
            var path = Uri.UnescapeDataString(new Uri(e.Request.Uri).AbsolutePath.TrimStart('/'));
            if (path.Length == 0)
                path = "index.html";

            e.Response = Resources.TryGetValue(path, out var resource)
                ? webView.Environment.CreateWebResourceResponse(Assembly.GetManifestResourceStream(resource), 200, "OK",
                    $"Content-Type: {ContentType(path)}")
                : webView.Environment.CreateWebResourceResponse(null, 404, "Not Found", "");
        };
    }

    static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" or ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" or ".map" => "application/json",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".webp" => "image/webp",
        ".ico" => "image/x-icon",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        ".ttf" => "font/ttf",
        _ => "application/octet-stream",
    };
}
