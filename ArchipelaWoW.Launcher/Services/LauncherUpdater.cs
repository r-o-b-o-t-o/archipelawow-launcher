using System.Net;
using Velopack;
using Velopack.Locators;
using Velopack.Sources;

namespace ArchipelaWoW.Launcher.Services;

/// <param name="Supported">False when Velopack didn't install the launcher, as in development.</param>
/// <param name="Version">The newer release, if any.</param>
/// <param name="Downloaded">Whether that release is downloaded, waiting for the launcher to restart into it.</param>
public sealed record LauncherUpdate(bool Supported, string? Version, bool Downloaded);

/// <summary>
/// Updates the launcher from its GitHub releases with Velopack, when the setup installed it or it was extracted from the
/// portable archive. Velopack replaces current\ (the launcher), Update.exe and the exe that starts the launcher, and
/// keeps its downloads in packages\. It leaves the server, the settings and the player options alone.
/// </summary>
public sealed class LauncherUpdater
{
    const string RepositoryUrl = "https://github.com/r-o-b-o-t-o/archipelawow-launcher";
    static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    // For the whole lookup: from GitHub, it reads releases.win.json from each of the 10 latest releases
    static readonly TimeSpan LookupTimeout = TimeSpan.FromMinutes(1);

    // ARCHIPELAWOW_UPDATE_FEED, a folder or web address holding the output of vpk pack, tries an update out before it's
    // released
    readonly UpdateManager _manager = Environment.GetEnvironmentVariable("ARCHIPELAWOW_UPDATE_FEED") is { Length: > 0 } feed
        ? new UpdateManager(feed)
        : new UpdateManager(new GithubSource(RepositoryUrl, accessToken: null, prerelease: false));
    (DateTimeOffset At, UpdateInfo? Update)? _lastCheck;

    public bool IsSupported => _manager.IsInstalled;

    /// <summary>Whether the setup installed the launcher, which then keeps its data in a set folder.</summary>
    public bool IsInstalledBySetup => _manager.IsInstalled && !_manager.IsPortable;

    /// <summary>Whether quitting restarts the launcher into the downloaded update.</summary>
    public bool RestartOnExit { get; set; }

    /// <summary>
    /// The folder of the server, the player options and the launcher's settings, unless told otherwise. A portable
    /// launcher keeps them in its own folder. One the setup installed keeps them out of its installation folder, which
    /// Velopack empties when uninstalling the launcher or installing it again.
    /// </summary>
    public static string DefaultRoot()
    {
        var locator = VelopackLocator.Current;
        if (locator.CurrentlyInstalledVersion == null || locator.RootAppDir == null)
            return Path.GetDirectoryName(Environment.ProcessPath)!;
        return locator.IsPortable
            ? locator.RootAppDir
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ArchipelaWoW");
    }

    public async Task<LauncherUpdate> CheckAsync()
    {
        if (!IsSupported)
            return new LauncherUpdate(false, null, false);
        if (_lastCheck is not { } check || DateTimeOffset.Now - check.At >= CacheDuration)
            _lastCheck = check = (DateTimeOffset.Now, await FindUpdateAsync());
        var version = check.Update?.TargetFullRelease.Version;
        return new LauncherUpdate(true, version?.ToString(), version != null && _manager.UpdatePendingRestart?.Version == version);
    }

    /// <summary>Downloads the latest release, which the launcher applies when it restarts to update.</summary>
    public async Task DownloadAsync(TaskRunner task, CancellationToken token)
    {
        if (!IsSupported)
            throw new InvalidOperationException("This launcher can't update itself: it wasn't installed from a release.");
        task.Stage("Looking up the latest launcher release");
        var update = await FindUpdateAsync(token) ?? throw new InvalidOperationException("The launcher is up to date.");
        task.Stage($"Downloading ArchipelaWoW Launcher {update.TargetFullRelease.Version}");
        await _manager.DownloadUpdatesAsync(update, percent => task.Progress(percent / 100.0), token);
    }

    /// <summary>
    /// Has Velopack apply the downloaded update once the launcher has exited, then restart it, if
    /// <see cref="RestartOnExit"/>. Velopack first stops what still runs from the installation folder, which holds the
    /// servers of a portable launcher: call this once they're stopped. Never on a plain quit, out of sight: a launcher
    /// started again in the meantime would be stopped, with the servers it starts.
    /// </summary>
    public void ApplyOnExit()
    {
        if (!RestartOnExit || _manager.UpdatePendingRestart is not { } update)
            return;
        try
        {
            _manager.WaitExitThenApplyUpdates(update, silent: false, restart: true);
        }
        catch (Exception ex)
        {
            Log.Error("Could not start applying the launcher update", ex);
        }
    }

    async Task<UpdateInfo?> FindUpdateAsync(CancellationToken token = default)
    {
        try
        {
            // Velopack's lookup can't be cancelled, and waits up to 30 minutes for each request: on a timeout or a cancel,
            // it's left to finish in the background
            return await _manager.CheckForUpdatesAsync().WaitAsync(LookupTimeout, token);
        }
        catch (TimeoutException ex)
        {
            throw new InvalidOperationException("GitHub isn't answering, try again later.", ex);
        }
        catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
        {
            throw new InvalidOperationException(GitHub.RateLimitedMessage, ex);
        }
    }
}
