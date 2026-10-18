using ArchipelaWoW.Launcher.Terminal;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// mod-ah-bot-plus lists and buys auctions as the characters of its AuctionHouseBot.GUIDs setting: the launcher gives
/// it one, Auctionbot, on an account of its own.
/// </summary>
public sealed class AuctionHouseBotService(AppPaths paths, ConfigService configs, MySqlService mySql,
    AccountService accounts, CharacterService characters)
{
    const string Config = "modules/mod_ahbot.conf";
    const string Username = "AHBOT";
    const string Password = "ahbot";
    const string CharacterName = "Auctionbot";

    /// <summary>
    /// Creates the account and its character if they're missing, and points the module at the character. Only while
    /// the worldserver is stopped, see <see cref="CharacterService"/>.
    /// </summary>
    public async Task EnsureAsync(TerminalBuffer terminal, CancellationToken token)
    {
        // A build without the module
        if (!configs.Exists(Config))
            return;
        var loginDatabase = configs.GetDatabaseName("worldserver.conf", "LoginDatabaseInfo");
        var characterDatabase = configs.GetDatabaseName("worldserver.conf", "CharacterDatabaseInfo");
        if (loginDatabase == null || characterDatabase == null)
            return;

        // Before the worldserver's first start, which would create the character database once it's too late
        if (!await mySql.TableExistsAsync(loginDatabase, "account") || !await mySql.TableExistsAsync(characterDatabase, "characters"))
            await CreateDatabasesAsync(terminal, token);

        var account = await accounts.FindAsync(loginDatabase, Username);
        if (account == null)
        {
            terminal.WriteNotice($"Creating the {Username} account of the auction house bot...");
            account = await accounts.CreateAsync(loginDatabase, Username, Password);
        }

        var character = await characters.FindFirstAsync(characterDatabase, account);
        if (character == null)
        {
            terminal.WriteNotice($"Creating {CharacterName}, the character of the auction house bot...");
            character = await characters.CreateAsync(characterDatabase, account, CharacterName);
        }

        if (configs.GetValue(Config, "AuctionHouseBot.GUIDs") != character)
            configs.SetValues(Config, new Dictionary<string, string> { ["AuctionHouseBot.GUIDs"] = character });
    }

    async Task CreateDatabasesAsync(TerminalBuffer terminal, CancellationToken token)
    {
        // All of them: dbimport can't open the others without the world database. The worldserver then finds them
        // up to date.
        terminal.WriteNotice("Creating the databases...");
        using var tool = PtyProcess.Start(paths.ServerExe("dbimport"), [], paths.ServerDir, 120, 30, terminal.Write);
        await using var registration = token.Register(tool.Kill);
        var exitCode = await tool.Exited;
        token.ThrowIfCancellationRequested();
        if (exitCode != 0)
            throw new InvalidOperationException($"dbimport failed with code {exitCode}.");
    }
}
