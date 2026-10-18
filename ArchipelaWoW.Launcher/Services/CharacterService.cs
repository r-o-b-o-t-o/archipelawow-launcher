namespace ArchipelaWoW.Launcher.Services;

/// <summary>
/// Characters, written to the character database directly. Only while the worldserver is stopped: it hands out
/// character GUIDs counting from the highest it found when it started. Names must be safe to put in a query.
/// </summary>
public sealed class CharacterService(MySqlService mySql)
{
    /// <summary>The GUID of the account's first character, if it has one. Deleted characters move to account 0.</summary>
    public async Task<string?> FindFirstAsync(string characterDatabase, string account) =>
        MySqlService.NullIfEmpty(await mySql.QueryAsync(
            $"SELECT guid FROM `{characterDatabase}`.characters WHERE account = {account} ORDER BY guid LIMIT 1"));

    /// <summary>
    /// Creates a human warrior in Northshire, placed as the worldserver would, without the spells and items it would
    /// give: for characters nobody plays.
    /// </summary>
    /// <returns>The new character's GUID.</returns>
    public async Task<string> CreateAsync(string characterDatabase, string account, string name)
    {
        // The health is capped to the maximum when it loads
        await mySql.QueryAsync($"INSERT INTO `{characterDatabase}`.characters " +
            "(guid, account, name, race, class, gender, level, map, zone, position_x, position_y, position_z, orientation, " +
            "taximask, innTriggerId, cinematic, health) " +
            $"SELECT COALESCE(MAX(guid), 0) + 1, {account}, '{name}', 1, 1, 0, 1, 0, 12, -8949.95, -132.493, 83.5312, 0, " +
            $"'2 0 0 8 0 0 0 0 0 0 0 0 0 0 ', 0, 1, 1000 FROM `{characterDatabase}`.characters");
        return MySqlService.NullIfEmpty(await mySql.QueryAsync(
                $"SELECT guid FROM `{characterDatabase}`.characters WHERE account = {account} AND name = '{name}' ORDER BY guid DESC LIMIT 1"))
            ?? throw new InvalidOperationException($"Creating {name} failed.");
    }
}
