using Velopack;

namespace ArchipelaWoW.Launcher;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        // First of all: Velopack's setup, updater and uninstaller start the launcher with arguments of their own and expect
        // it to exit. A downloaded update isn't applied here but when the launcher restarts to update, see LauncherUpdater.
        VelopackApp.Build().SetAutoApplyOnStartup(false).Run();

        new App().Run();
    }
}
