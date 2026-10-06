using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using ArchipelaWoW.Launcher.Services;
using Microsoft.Web.WebView2.Core;

namespace ArchipelaWoW.Launcher;

public partial class App : Application
{
    public const string ProductName = "ArchipelaWoW Launcher";

    AppServices? _services;
    Mutex? _instanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // --root and --dev-server are for development: the installation folder to manage (normally
        // LauncherUpdater.DefaultRoot), and a Vite dev server to load the UI from instead of the embedded one
        string? root = null, devServer = null;
        for (var i = 0; i < e.Args.Length - 1; i++)
        {
            if (e.Args[i] == "--root")
                root = e.Args[++i];
            else if (e.Args[i] == "--dev-server")
                devServer = e.Args[++i];
        }
        root ??= Environment.GetEnvironmentVariable("ARCHIPELAWOW_ROOT") ?? LauncherUpdater.DefaultRoot();
        devServer ??= Environment.GetEnvironmentVariable("ARCHIPELAWOW_DEV_SERVER");
        var paths = new AppPaths(root);

        try
        {
            Log.Init(paths.LauncherLogsDir);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Fail($"The launcher can't write to {paths.Root}.\n\nMove the ArchipelaWoW Launcher folder somewhere you can write to, " +
                 $"such as your Documents, and start it again.\n\n{ex.Message}");
            return;
        }

        // Two launchers on one folder would fight over the same MySQL data directory
        var rootHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(paths.Root.ToLowerInvariant())))[..16];
        _instanceMutex = new Mutex(true, $"ArchipelaWoW.Launcher.{rootHash}", out var isFirstInstance);
        if (!isFirstInstance)
        {
            Fail("The launcher is already running for this folder.");
            return;
        }

        try
        {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (MessageBox.Show("The launcher needs the Microsoft Edge WebView2 Runtime, which isn't installed.\n\nOpen its download page?",
                    ProductName, MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
                Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true });
            Shutdown(1);
            return;
        }

        DispatcherUnhandledException += (_, args) =>
        {
            Log.Error("Unhandled exception", args.Exception);
            MessageBox.Show(args.Exception.Message, ProductName, MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };

        Log.Info($"Starting in {paths.Root}");
        _services = new AppServices(paths);
        MainWindow = new MainWindow(_services, devServer);
        MainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _services?.Dispose();
        // Once the servers are stopped, and only by the instance that runs them
        _services?.LauncherUpdater.ApplyOnExit();
        _instanceMutex?.Dispose();
        base.OnExit(e);
    }

    void Fail(string message)
    {
        MessageBox.Show(message, ProductName, MessageBoxButton.OK, MessageBoxImage.Error);
        Shutdown(1);
    }
}
