using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using ArchipelaWoW.Launcher.Bridge;
using ArchipelaWoW.Launcher.Services;
using Microsoft.Web.WebView2.Core;

namespace ArchipelaWoW.Launcher;

public partial class MainWindow : Window
{
    static readonly HashSet<string> ClipboardMenuItems = ["cut", "copy", "paste", "selectAll"];

    readonly AppServices _services;
    readonly string? _devServer;
    BridgeHost? _bridge;
    bool _shuttingDown;
    bool _readyToClose;
    bool _confirmingClose;

    /// <summary>Set by the page while it holds edits that closing the window would lose.</summary>
    public bool HasUnsavedChanges { get; set; }

    public MainWindow(AppServices services, string? devServer)
    {
        _services = services;
        _devServer = devServer?.TrimEnd('/');
        InitializeComponent();
        SourceInitialized += (_, _) => UseDarkTitleBar();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: _services.Paths.WebViewDataDir);
            await WebView.EnsureCoreWebView2Async(environment);
            var webView = WebView.CoreWebView2;

            webView.Settings.IsStatusBarEnabled = false;
            webView.Settings.IsGeneralAutofillEnabled = false;
            webView.Settings.IsPasswordAutosaveEnabled = false;
            webView.Settings.AreDevToolsEnabled =
                _devServer != null || Environment.GetEnvironmentVariable("ARCHIPELAWOW_DEVTOOLS") == "1";
            webView.ContextMenuRequested += OnContextMenuRequested;

            // Anything that isn't the launcher's own page opens in the user's browser
            var origin = _devServer ?? UiContent.Origin;
            webView.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenExternal(args.Uri);
            };
            webView.NavigationStarting += (_, args) =>
            {
                if (args.Uri.StartsWith(origin + "/", StringComparison.OrdinalIgnoreCase))
                {
                    // Reloading loses the page's edits anyway
                    HasUnsavedChanges = false;
                    return;
                }
                args.Cancel = true;
                OpenExternal(args.Uri);
            };

            if (_devServer == null)
            {
                if (!UiContent.IsAvailable)
                    throw new InvalidOperationException(
                        "This build has no interface embedded: build ui first, or start with --dev-server http://localhost:5173.");
                UiContent.Attach(webView);
            }

            var servers = _services.Servers;
            _bridge = new BridgeHost(webView, Dispatcher, origin,
                [servers.MySql.Terminal, servers.AuthServer.Terminal, servers.WorldServer.Terminal, _services.Tasks.Terminal]);
            BridgeApi.Register(_bridge, _services, this);
            webView.Navigate(origin + "/");
        }
        catch (Exception ex)
        {
            Log.Error("Could not start the interface", ex);
            MessageBox.Show(this, $"The launcher interface could not start:\n\n{ex.Message}", App.ProductName,
                MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
            return;
        }

        if (_services.Settings.Current.AutoStartServers && _services.MySql.IsInitialized && _services.Configs.ConfigsExist)
        {
            try
            {
                await _services.Servers.StartAllAsync();
            }
            catch (Exception ex)
            {
                // The servers' terminals show what went wrong
                Log.Error("Starting the servers on launch failed", ex);
            }
        }
    }

    async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_readyToClose)
            return;
        if (_shuttingDown)
        {
            e.Cancel = true;
            return;
        }

        var updater = _services.LauncherUpdater;
        var quit = updater.RestartOnExit ? "restart to update" : "quit";
        var task = _services.Tasks.Current;
        if (!_services.Servers.AnyActive && task == null)
        {
            if (HasUnsavedChanges && !Confirm($"Discard the unsaved changes and {quit}?"))
            {
                e.Cancel = true;
                updater.RestartOnExit = false;
            }
            return;
        }

        e.Cancel = true;
        var message = task != null
            ? $"\"{task.Title}\" is still running. Cancel it, stop the servers and {quit}?"
            : $"The servers are still running. Stop them and {quit}?";
        if (HasUnsavedChanges)
            message += "\n\nThe unsaved changes will be lost.";
        if (!Confirm(message))
        {
            updater.RestartOnExit = false;
            return;
        }

        _shuttingDown = true;
        _bridge?.Emit("app.shuttingDown", null);
        _services.Tasks.Cancel();
        try
        {
            await _services.Servers.ShutDownAsync();
            // Cancelling doesn't stop a task while it replaces or deletes files, such as the server's or the client data's
            await _services.Tasks.Idle;
        }
        catch (Exception ex)
        {
            Log.Error("Stopping the servers failed", ex);
        }
        _readyToClose = true;
        Close();
    }

    /// <summary>Quits as closing the window does, asking first if need be, then restarts into the downloaded update.</summary>
    public void RestartToUpdate()
    {
        // Not while the window is closing already, on the user's choice: Close() would throw then
        if (_confirmingClose || _shuttingDown)
            return;
        _services.LauncherUpdater.RestartOnExit = true;
        Close();
    }

    bool Confirm(string message)
    {
        // Within the Closing event, whose dialog lets queued work such as RestartToUpdate run
        _confirmingClose = true;
        try
        {
            return MessageBox.Show(this, message, App.ProductName, MessageBoxButton.OKCancel, MessageBoxImage.Question) == MessageBoxResult.OK;
        }
        finally
        {
            _confirmingClose = false;
        }
    }

    void OnContextMenuRequested(object? sender, CoreWebView2ContextMenuRequestedEventArgs e)
    {
        if (WebView.CoreWebView2.Settings.AreDevToolsEnabled)
            return;
        // Reload, print, save as and the like make no sense in a launcher
        var items = e.MenuItems;
        for (var i = items.Count - 1; i >= 0; i--)
        {
            if (!ClipboardMenuItems.Contains(items[i].Name))
                items.RemoveAt(i);
        }
        if (items.Count == 0)
            e.Handled = true;
    }

    static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.Scheme is "http" or "https")
            Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
    }

    void UseDarkTitleBar()
    {
        const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        var enabled = 1;
        DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref enabled, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
