using System.Numerics;
using System.Security.Cryptography;
using System.Text;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// Game accounts, written to the login database directly: the worldserver doesn't need to run. Names must be safe to
/// put in a query.
/// </summary>
public sealed class AccountService(MySqlService mySql)
{
    // The client's SRP6 parameters
    const int G = 7;
    static readonly BigInteger N = new(
        Convert.FromHexString("894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7"), isUnsigned: true, isBigEndian: true);

    /// <summary>The id of the account of that name, if there is one.</summary>
    public async Task<string?> FindAsync(string loginDatabase, string username) =>
        MySqlService.NullIfEmpty(await mySql.QueryAsync($"SELECT id FROM `{loginDatabase}`.account WHERE username = '{username}'"));

    /// <summary>Creates an account, as the worldserver's account create and account set gmlevel commands would.</summary>
    /// <param name="gmLevel">0 for a player, up to 3 for an administrator, on every realm.</param>
    /// <returns>The new account's id.</returns>
    public async Task<string> CreateAsync(string loginDatabase, string username, string password, int gmLevel = 0)
    {
        // As the worldserver stores them
        username = username.ToUpperInvariant();
        var salt = RandomNumberGenerator.GetBytes(32);
        // The client stops at the first statement that fails, and the transaction rolls back as it disconnects
        var sql = "START TRANSACTION; " +
            $"INSERT INTO `{loginDatabase}`.account (username, salt, verifier) " +
            $"VALUES ('{username}', X'{Convert.ToHexString(salt)}', X'{Convert.ToHexString(Verifier(username, password, salt))}'); " +
            "SET @account = LAST_INSERT_ID(); " +
            // Its character count on each realm, shown in the realm list
            $"INSERT INTO `{loginDatabase}`.realmcharacters (realmid, acctid, numchars) SELECT id, @account, 0 FROM `{loginDatabase}`.realmlist; " +
            (gmLevel > 0 ? $"INSERT INTO `{loginDatabase}`.account_access (id, gmlevel, RealmID) VALUES (@account, {gmLevel}, -1); " : "") +
            "COMMIT; SELECT @account";
        return MySqlService.NullIfEmpty(await mySql.QueryAsync(sql)) ?? throw new InvalidOperationException($"Creating the {username} account failed.");
    }

    // As AzerothCore checks it: v = g^H(salt | H(USERNAME:PASSWORD)) mod N, little-endian
    static byte[] Verifier(string username, string password, byte[] salt)
    {
        var credentials = SHA1.HashData(Encoding.UTF8.GetBytes($"{username}:{password}".ToUpperInvariant()));
        var x = new BigInteger(SHA1.HashData([.. salt, .. credentials]), isUnsigned: true);
        var verifier = BigInteger.ModPow(G, x, N).ToByteArray(isUnsigned: true);
        Array.Resize(ref verifier, 32);
        return verifier;
    }
}
