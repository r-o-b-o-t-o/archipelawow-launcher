using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace ArchipelaWoW.Launcher.Services;

/// <summary>Who can join the realm: players on this computer, on its local network, or over the internet.</summary>
public enum RealmAccess { Local, Lan, Internet }

public sealed record LanAddress(string Address, string SubnetMask);

/// <summary>
/// The realm's addresses in the login database. The authserver hands a game client the realm's local address when
/// the client is on its subnet, or on this computer unless one of the addresses is a loopback address, and its
/// address otherwise (AzerothCore's Realm::GetAddressForClient).
/// </summary>
public sealed class NetworkService(SettingsStore settings, MySqlService mySql, ConfigService configs, HttpClient http)
{
    const string Loopback = "127.0.0.1";

    public object GetStatus() => new
    {
        settings.Current.Network.Access,
        settings.Current.Network.PublicAddress,
        Lan = FindLanAddress(),
        AuthServerPort = configs.GetInt("authserver.conf", "RealmServerPort") ?? 3724,
        WorldServerPort = configs.GetInt("worldserver.conf", "WorldServerPort") ?? 8085,
    };

    public async Task SetAsync(RealmAccess access, string? publicAddress)
    {
        publicAddress = publicAddress?.Trim();
        if (access == RealmAccess.Internet && Uri.CheckHostName(publicAddress) is not (UriHostNameType.IPv4 or UriHostNameType.Dns))
            throw new ArgumentException("Enter your public IP address, or a host name pointing to it.");
        if (access != RealmAccess.Local && FindLanAddress() is null)
            throw new InvalidOperationException("This computer isn't connected to a network.");
        settings.Update(s =>
        {
            s.Network.Access = access;
            if (access == RealmAccess.Internet)
                s.Network.PublicAddress = publicAddress;
        });
        await ApplyAsync();
    }

    /// <summary>
    /// Writes the realm's addresses, with this computer's current address on the local network. A running authserver
    /// reads them again within RealmsStateUpdateDelay.
    /// </summary>
    public async Task ApplyAsync()
    {
        var network = settings.Current.Network;
        if (network.Access is not { } access ||
            configs.GetDatabaseName("authserver.conf", "LoginDatabaseInfo") is not { } loginDatabase)
            return;
        var lan = access == RealmAccess.Local ? null : FindLanAddress();
        if (access != RealmAccess.Local && lan is null)
        {
            Log.Info("Not changing the realm's addresses: this computer isn't connected to a network.");
            return;
        }
        var (address, localAddress, subnetMask) = access switch
        {
            RealmAccess.Lan => (lan!.Address, lan.Address, lan.SubnetMask),
            RealmAccess.Internet => (network.PublicAddress!, lan!.Address, lan.SubnetMask),
            _ => (Loopback, Loopback, "255.255.255.0"),
        };
        await mySql.SetRealmAddressesAsync(loginDatabase, address, localAddress, subnetMask);
    }

    public async Task<string> FindPublicAddressAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try
        {
            return (await http.GetStringAsync("https://api.ipify.org", timeout.Token)).Trim();
        }
        catch (OperationCanceledException)
        {
            throw new InvalidOperationException("ipify.org didn't answer, try again later.");
        }
    }

    /// <summary>This computer's address on the network its internet traffic goes through.</summary>
    public static LanAddress? FindLanAddress()
    {
        IPAddress address;
        try
        {
            // Only picks the route: nothing is sent
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.Connect(IPAddress.Parse("8.8.8.8"), 53);
            address = ((IPEndPoint)socket.LocalEndPoint!).Address;
        }
        catch (SocketException)
        {
            return null;
        }
        var mask = NetworkInterface.GetAllNetworkInterfaces()
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .FirstOrDefault(a => a.Address.Equals(address))?.IPv4Mask;
        return mask is null ? null : new LanAddress(address.ToString(), mask.ToString());
    }
}
