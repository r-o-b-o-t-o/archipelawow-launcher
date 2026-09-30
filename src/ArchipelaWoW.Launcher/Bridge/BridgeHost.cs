using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Threading;
using ArchipelaWoW.Launcher.Terminal;
using Microsoft.Web.WebView2.Core;

namespace ArchipelaWoW.Launcher.Bridge;

/// <summary>
/// RPC between the UI and the launcher over WebView2 web messages. The page posts
/// <c>{id, method, params}</c> and gets <c>{id, result}</c> or <c>{id, error}</c> back; the launcher
/// pushes <c>{event, data}</c> on its own.
/// </summary>
public sealed class BridgeHost
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    readonly CoreWebView2 _webView;
    readonly Dispatcher _dispatcher;
    readonly string _trustedOrigin;
    readonly IReadOnlyList<TerminalBuffer> _terminals;
    readonly Dictionary<string, Func<JsonElement, Task<object?>>> _methods = new();

    public BridgeHost(CoreWebView2 webView, Dispatcher dispatcher, string trustedOrigin, IReadOnlyList<TerminalBuffer> terminals)
    {
        _webView = webView;
        _dispatcher = dispatcher;
        _trustedOrigin = trustedOrigin.TrimEnd('/');
        _terminals = terminals;
        _webView.WebMessageReceived += OnMessage;

        // Terminal output is batched so that a burst of log lines becomes a few messages
        new DispatcherTimer(TimeSpan.FromMilliseconds(40), DispatcherPriority.Background, (_, _) => FlushTerminals(), dispatcher).Start();
    }

    public void Handle(string method, Func<object?> handler) => _methods[method] = _ => Task.FromResult(handler());

    public void Handle<TParams>(string method, Func<TParams, object?> handler) =>
        _methods[method] = element => Task.FromResult(handler(Parse<TParams>(method, element)));

    public void HandleAsync(string method, Func<Task<object?>> handler) => _methods[method] = _ => handler();

    public void HandleAsync<TParams>(string method, Func<TParams, Task<object?>> handler) =>
        _methods[method] = element => handler(Parse<TParams>(method, element));

    static TParams Parse<TParams>(string method, JsonElement element) =>
        (element.ValueKind == JsonValueKind.Undefined ? default : element.Deserialize<TParams>(JsonOptions))
        ?? throw new ArgumentException($"{method}: missing parameters.");

    /// <summary>Pushes an event to the page. Safe to call from any thread.</summary>
    public void Emit(string name, object? data) =>
        _dispatcher.InvokeAsync(() => Post(new { @event = name, data }));

    async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Only the launcher's own page may drive it, not whatever the view might navigate to
        if (!e.Source.StartsWith(_trustedOrigin + "/", StringComparison.OrdinalIgnoreCase))
            return;

        Request? request;
        try
        {
            request = JsonSerializer.Deserialize<Request>(e.WebMessageAsJson, JsonOptions);
        }
        catch (JsonException)
        {
            return;
        }
        if (request == null)
            return;

        try
        {
            if (!_methods.TryGetValue(request.Method, out var handler))
                throw new InvalidOperationException($"Unknown method {request.Method}.");
            var result = await handler(request.Params);
            Post(new { id = request.Id, result });
        }
        catch (Exception ex)
        {
            if (ex is not (InvalidOperationException or ArgumentException or OperationCanceledException or IOException))
                Log.Error($"{request.Method} failed", ex);
            Post(new { id = request.Id, error = ex.Message });
        }
    }

    void FlushTerminals()
    {
        foreach (var terminal in _terminals)
        {
            if (terminal.Commit() is { } chunk)
                Post(new { @event = "terminal.output", data = new { name = terminal.Name, data = chunk.Data, seq = chunk.Sequence } });
        }
    }

    void Post(object message)
    {
        try
        {
            _webView.PostWebMessageAsJson(JsonSerializer.Serialize(message, JsonOptions));
        }
        catch (InvalidOperationException)
        {
            // The view was closed; events still come in while the launcher shuts down
        }
    }

    sealed record Request(int Id, string Method, JsonElement Params);
}
