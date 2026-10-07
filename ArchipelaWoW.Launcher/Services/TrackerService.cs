using System.Text.Json.Nodes;
using Archipelago.MultiClient.Net;
using Archipelago.MultiClient.Net.Enums;
using Archipelago.MultiClient.Net.Models;
using Archipelago.MultiClient.Net.Packets;
using Newtonsoft.Json;

namespace ArchipelaWoW.Launcher.Services;

public enum TrackerStatus
{
    Disconnected,
    Connecting,
    Connected,
}

public sealed record TrackerItem(int Index, long Item, string Name, string LocationName, int Player, string PlayerName);

/// <summary>What the tracker knows of the seed it's connected to, sent to the page whole when it asks.</summary>
public sealed record TrackerSeed(
    string PlayerName,
    JsonNode? SlotData,
    Dictionary<long, string> ItemNames,
    Dictionary<long, string> Locations,
    List<long> Checked,
    List<TrackerItem> Items);

/// <summary>
/// The tracker's connection to an Archipelago room. It joins a slot as a tracker, alongside the game, and
/// relays what the slot receives and checks to the page, which works out the rest from the slot data.
/// </summary>
public sealed class TrackerService : IDisposable
{
    public const string Game = "World of Warcraft";

    readonly object _lock = new();
    ArchipelagoSession? _session;
    TrackerSeed? _seed;

    public TrackerStatus Status { get; private set; }
    public string? Error { get; private set; }

    // Raised under the lock, so the page hears of the changes in the order they happen: the bridge only
    // queues its messages, which is all a handler may do
    public event Action? StatusChanged;
    public event Action<TrackerSeed>? SeedChanged;
    public event Action<List<TrackerItem>>? ItemsReceived;
    public event Action<List<long>>? LocationsChecked;

    public TrackerSeed? Seed
    {
        get
        {
            lock (_lock)
                return _seed == null ? null : Snapshot(_seed);
        }
    }

    // The seed's lists grow as the room sends more, while the page reads a copy on another thread
    static TrackerSeed Snapshot(TrackerSeed seed) => seed with { Checked = [.. seed.Checked], Items = [.. seed.Items] };

    public async Task ConnectAsync(string host, int port, string slot, string? password)
    {
        Disconnect();

        // Without a scheme, the library tries wss:// and then ws://, as the rooms on archipelago.gg
        // and a MultiServer.py on a LAN each take one of them. It gives both 4 seconds, and Windows takes 2 to
        // refuse a connection: localhost, tried on ::1 first, would miss a room that only listens on IPv4.
        host = host.Trim();
        var address = host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ? "127.0.0.1" : host;
        var session = ArchipelagoSessionFactory.CreateSession(address, port);
        lock (_lock)
        {
            _session = session;
            Status = TrackerStatus.Connecting;
            Error = null;
            StatusChanged?.Invoke();
        }

        LoginResult result;
        try
        {
            await session.ConnectAsync();
            result = await session.LoginAsync(Game, slot.Trim(), ItemsHandlingFlags.AllItems, tags: ["Tracker"],
                password: string.IsNullOrEmpty(password) ? null : password, requestSlotData: true);
        }
        catch (Exception ex)
        {
            // The library cancels the connection when it can't open one in time
            result = new LoginFailure(ex is OperationCanceledException ? $"Couldn't reach a room at {host}:{port}." : ex.Message);
        }

        if (result is not LoginSuccessful success)
        {
            var errors = ((LoginFailure)result).Errors;
            Fail(session, errors.Length > 0 ? string.Join(" ", errors) : "The room refused the connection.");
            return;
        }

        GameData gameData;
        try
        {
            gameData = await GetGameDataAsync(session);
        }
        catch (Exception ex)
        {
            Fail(session, ex is TimeoutException ? $"The room didn't send the names of {Game}'s items and locations." : ex.Message);
            return;
        }

        // Listening first, until the seed below is taken, so nothing falls between the two
        session.Items.ItemReceived += helper =>
        {
            lock (_lock)
            {
                if (_session != session || _seed == null)
                    return;
                List<TrackerItem> received = [.. helper.AllItemsReceived.Select(ToTrackerItem).Skip(_seed.Items.Count)];
                _seed.Items.AddRange(received);
                if (received.Count > 0)
                    ItemsReceived?.Invoke(received);
            }
        };
        session.Locations.CheckedLocationsUpdated += ids =>
        {
            lock (_lock)
            {
                if (_session != session || _seed == null)
                    return;
                _seed.Checked.AddRange(ids);
                LocationsChecked?.Invoke([.. ids]);
            }
        };
        session.Socket.SocketClosed += reason => Fail(session, "The connection to the room was lost.");
        // A room that goes away without closing the connection shows up as an error
        session.Socket.ErrorReceived += (exception, message) =>
        {
            Log.Info($"Tracker connection error: {message}");
            if (!session.Socket.Connected)
                Fail(session, "The connection to the room was lost.");
        };

        lock (_lock)
        {
            if (_session != session)
                return;
            var locationNames = gameData.LocationLookup.ToDictionary(pair => pair.Value, pair => pair.Key);
            _seed = new TrackerSeed(
                session.Players.ActivePlayer.Name,
                JsonNode.Parse(JsonConvert.SerializeObject(success.SlotData)),
                gameData.ItemLookup.ToDictionary(pair => pair.Value, pair => pair.Key),
                session.Locations.AllLocations.ToDictionary(id => id, id => locationNames.GetValueOrDefault(id, id.ToString())),
                [.. session.Locations.AllLocationsChecked],
                [.. session.Items.AllItemsReceived.Select(ToTrackerItem)]);
            Status = TrackerStatus.Connected;
            Error = null;
            StatusChanged?.Invoke();
            SeedChanged?.Invoke(Snapshot(_seed));
        }
    }

    /// <summary>The game's item and location names, which the page needs for items the slot hasn't received yet.</summary>
    static async Task<GameData> GetGameDataAsync(ArchipelagoSession session)
    {
        var received = new TaskCompletionSource<GameData>(TaskCreationOptions.RunContinuationsAsynchronously);
        void OnPacket(ArchipelagoPacketBase packet)
        {
            if (packet is DataPackagePacket { DataPackage.Games: { } games } && games.TryGetValue(Game, out var data))
                received.TrySetResult(data);
        }

        session.Socket.PacketReceived += OnPacket;
        try
        {
            await session.Socket.SendPacketAsync(new GetDataPackagePacket { Games = [Game] });
            return await received.Task.WaitAsync(TimeSpan.FromSeconds(30));
        }
        finally
        {
            session.Socket.PacketReceived -= OnPacket;
        }
    }

    // The items are listed in the order the room hands them out, and that order is their index
    TrackerItem ToTrackerItem(ItemInfo item, int index) => new(
        index,
        item.ItemId,
        item.ItemDisplayName,
        item.LocationDisplayName,
        item.Player.Slot,
        item.Player.Name);

    public void Disconnect()
    {
        ArchipelagoSession? session;
        lock (_lock)
            session = _session;
        if (session != null)
            Fail(session, null);
    }

    /// <summary>
    /// Forgets <paramref name="session"/> and closes it, with <paramref name="error"/> as the reason, if it's
    /// still the current one: a connection that was replaced or lost meanwhile leaves the status alone.
    /// </summary>
    void Fail(ArchipelagoSession session, string? error)
    {
        lock (_lock)
        {
            if (_session != session)
                return;
            _session = null;
            _seed = null;
            Status = TrackerStatus.Disconnected;
            Error = error;
            StatusChanged?.Invoke();
        }
        _ = session.Socket.DisconnectAsync();
    }

    public void Dispose() => Disconnect();
}
