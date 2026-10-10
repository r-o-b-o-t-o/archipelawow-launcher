# 🌍 ArchipelaWoW Launcher

The easiest way to host [ArchipelaWoW](https://github.com/r-o-b-o-t-o/archipelawow) on Windows: a
launcher that installs a ready-to-run build of [AzerothCore](https://www.azerothcore.org/) with the
ArchipelaWoW modules, edits Archipelago player options, and tracks your checks on the game's world maps.

No development tools, database server or runtime to install: run the setup, or extract the portable
archive. The launcher downloads the server, sets up the database and the configuration, gets the client
data, runs the servers with their consoles in one window, and keeps the server and itself up to date.
The player options editor and the tracker work without the server.

> [!WARNING]
> The launcher is a convenient way to run ArchipelaWoW with its default setup, and nothing more: the
> servers come prebuilt, so you can't add other modules or make changes to the code.
>
> Repacks like this one aren't supported by AzerothCore, so don't ask the AzerothCore community for
> help with it. Join the [Unofficial Archipelago Discord server](https://discord.gg/Nu4X9gmGDR) instead,
> and head to the
> [ArchipelaWoW thread](https://discord.com/channels/1345801058609270794/1436315171969568859) in the
> `future-game-design` forum.

## 🚀 Playing

1. Get the launcher from the [latest release](../../releases/latest), either:
   - `ArchipelaWoW.Launcher-win-Setup.exe`: run it to install the launcher for your Windows account,
     with shortcuts on the desktop and in the Start menu. It keeps the server and the player options in
     `%LocalAppData%\ArchipelaWoW`.
   - `ArchipelaWoW.Launcher-win-Portable.zip`, which keeps everything in its folder: extract it close to
     the root of a drive, e.g. into `C:\Games\ArchipelaWoW`, and start `ArchipelaWoW Launcher.exe`. Deep
     folders don't work: the server can't open files whose path is longer than 259 characters, and the
     launcher warns about it.
2. Follow the launcher's setup: the server, the database, the configuration, then the client data, which
   you can download or extract from your own World of Warcraft 3.3.5a client.
3. Start the servers from the dashboard, create a game account there, and set `set realmlist 127.0.0.1`
   in your client's `Data\<locale>\realmlist.wtf`.

To only make player options or track a seed, skip the setup and open **Player options** or **Tracker**.

### Playing with friends

The last step of the setup chooses who can join the realm: this computer only, the computers on its local
network, or friends over the internet. The launcher finds the computer's address on the local network each
time the authserver starts. Over the internet, forward the authserver's and the worldserver's TCP ports (3724
and 8085) to that address in your router's control panel; the setup links to a checker that tells whether
they're open from the outside. The other players point their `realmlist.wtf` at the address the setup shows.

### Installing the apworld

To generate and host seeds with Archipelago, the **APWorld** page installs a release of the
[apworld](https://github.com/r-o-b-o-t-o/archipelawow/releases) in the Archipelago launcher's
`custom_worlds` folder, replacing the version there.

It runs on 64-bit Windows 10 (1809 or later) and 11. The interface uses the Microsoft Edge WebView2
Runtime, which comes with Windows 11 and up-to-date Windows 10; the launcher links to its installer
when it's missing.

The portable launcher's folder can be moved: it keeps working from its new place.

### Tracking a seed

The **Tracker** joins your slot in the Archipelago room, next to your game, and shows the seed's checks on
the world maps: green in logic, red out of logic, grey once checked (hidden by default). Yellow checks are
out of logic but doable: they only miss class abilities or riding ranks, which the level brackets ask for
to pace the seed. A marker holding checks of several colours is split between them. Enter the room's host
and port, your slot name and the room's password if it has one; with the server installed, the tracker
starts from the room the server connects to.

- Drag to move a map, use the wheel to zoom, left click a zone to open it and right click to go back up.
  A zone's map also opens the zones around it, where they show at its edges.
- Checks close to one another share a marker, like the quests of a quest hub. Click a marker for its
  checks, and a red check for what it's waiting for.
- The side panel shows your character, the goal and the progressive items, the checks that have no place
  on a map, such as class training and levels by bracket, and the items you received.

Logic comes with the seed: one generated with an apworld older than its rules for trackers shows its
checks without logic colours.

### Updating

The server step of the launcher's **Setup** page shows when a new server release is out. Updating it
keeps the databases, configuration, client data and player options, and the server applies the new
database updates when it starts. The same step switches to another build of the server, or deletes the
server with its databases, configuration, client data and logs.

The sidebar shows when a new launcher release is out. Update from the launcher's card in the
settings: the launcher downloads the release, stops the servers (asking first) and restarts. If you
cancel the restart, the downloaded update waits in that card until you restart to update. Updating the
launcher keeps the server, its settings and the player options.

Launcher 1.0.0 and the releases before it don't update themselves: close the launcher, extract the
portable archive over its folder, delete the old `ArchipelaWoW.Launcher.exe` and `licenses`, and start
`ArchipelaWoW Launcher.exe`. Coming from a release that had the server in it (the ones numbered by
date, like 2026.10.3.2), update the server from the Setup page next: the `release.json` left at the root
of the folder is no longer used.

### Uninstalling

The launcher installed by the setup is uninstalled from Windows' installed apps, which leaves
`%LocalAppData%\ArchipelaWoW`: delete the server from the Setup page first, or delete that folder
after. The portable launcher is only its folder.

### What's in the folder

| Path | Contents |
| --- | --- |
| `ArchipelaWoW Launcher.exe` | Starts the launcher |
| `current` | The launcher, with in `current\licenses` the licenses of the software it's built with |
| `Update.exe`, `packages` | The launcher's updater ([Velopack](https://velopack.io)) and the updates it downloaded |
| `launcher` | The launcher's settings, logs (including the MySQL and tasks consoles) and downloads |
| `players` | Archipelago player options (YAML) |
| `server\bin` | authserver, worldserver, dbimport and the client data extractors |
| `server\configs` | The servers' configuration, created by the launcher from the `.conf.dist` files |
| `server\source` | The SQL files the server builds and updates its databases from |
| `server\licenses` | The licenses of the software in the server, besides MySQL's, which are in `mysql` |
| `server\release.json` | What the server was built from: versions and commits |
| `server\data`, `server\logs` | Client data and server logs, created by the launcher |
| `mysql` | MySQL Community Server; `mysql\data` holds the databases |

`server` and `mysql` come from the [server releases](https://github.com/r-o-b-o-t-o/archipelawow-repack/releases),
built by [archipelawow-repack](https://github.com/r-o-b-o-t-o/archipelawow-repack).

That's the portable launcher's folder. The setup puts the first three rows in
`%LocalAppData%\ArchipelaWoW.Launcher`, and the rest in `%LocalAppData%\ArchipelaWoW`.

MySQL listens on `127.0.0.1:3310` only (the port can be changed in the settings), with the user `acore`
and the password `acore`, for tools such as HeidiSQL or Keira3.

## 📦 Releases

Pushing a version tag on master releases the launcher with [`release.yml`](.github/workflows/release.yml).
The tag must match `<Version>` in [`ArchipelaWoW.Launcher.csproj`](ArchipelaWoW.Launcher/ArchipelaWoW.Launcher.csproj):
bump it, push to master, then tag that commit.

```bash
git tag v1.2.3
```

```bash
git push origin v1.2.3
```

It packs the launcher with [Velopack](https://velopack.io)'s `vpk`, in the version of the project's
`Velopack` package, and publishes the setup, the portable archive, and what the launchers update from:
`releases.win.json`, the full package, and the delta package from the previous release. If the release
job fails once `vpk` has made the draft release, delete the draft before running the job again.

[`build.yml`](.github/workflows/build.yml) builds every push to master and every pull request into it,
and checks the interface's formatting.

The player options editor follows the newest release of the apworld, pre-releases included, whose
options both workflows turn into a schema with [`scripts/dump-options-schema.py`](scripts/dump-options-schema.py). When that fails,
so does the build.

The setup offers each archive of the latest
[server release](https://github.com/r-o-b-o-t-o/archipelawow-repack/releases/latest) as a build:
`ArchipelaWoW-Repack-<build>-<version>.zip`.

## 🛠️ Development

The launcher is a WPF window (.NET 10) hosting a WebView2 that shows a SolidJS interface. They talk
over WebView2 web messages ([`BridgeApi.cs`](ArchipelaWoW.Launcher/Bridge/BridgeApi.cs) on one side,
[`api.ts`](ui/src/lib/api.ts) on the other). The servers run in pseudoconsoles (ConPTY), which the
interface shows with xterm.js.

Requirements: the .NET 10 SDK, Node.js 22 and Python 3.11 or later.

1. **Generate the player options schema**, which the interface needs and the repository doesn't hold.
   It takes a checkout of [Archipelago](https://github.com/ArchipelagoMW/Archipelago) and of the
   apworld (or an extracted `.apworld`):

   ```bash
   pip install PyYAML schema typing_extensions pathspec
   python scripts/dump-options-schema.py --archipelago <Archipelago> --world <archipelawow> --output ui/src/data/options-schema.json
   ```

2. **Run the interface** from the Vite dev server:

   ```bash
   cd ui
   npm install
   npm run dev
   ```

3. **Start the launcher** on an installation folder, loading the interface from the dev server. An empty
   folder works: install the server from the setup.

   ```bash
   dotnet run --project ArchipelaWoW.Launcher -- --root <installation folder> --dev-server http://localhost:5173
   ```

A Release build embeds the interface, building it first:

```bash
dotnet publish ArchipelaWoW.Launcher -c Release -o publish
```

To try an update out, with `vpk` (`dotnet tool install --global vpk --version <the Velopack package's
version>`):

1. Publish and pack a version with the commands below, then extract its portable archive,
   `releases\ArchipelaWoW.Launcher-win-Portable.zip`, out of `releases`: packing another version
   replaces it.
2. Publish and pack a newer version the same way, into the same `releases`.
3. Start the extracted launcher with `ARCHIPELAWOW_UPDATE_FEED` set to the full path of `releases`, and
   update it from the settings.

```bash
dotnet publish ArchipelaWoW.Launcher -c Release -o publish -p:Version=1.2.3
```

```bash
vpk pack --packId ArchipelaWoW.Launcher --packVersion 1.2.3 --packDir publish --mainExe ArchipelaWoW.Launcher.exe --packTitle "ArchipelaWoW Launcher" --runtime win-x64 --outputDir releases
```

- The interface is formatted with Prettier: `npm run format` in `ui`.
- The tracker's maps, positions and icons in `ui/public/tracker` are written by
  [archipelawow-data-extractor](https://github.com/r-o-b-o-t-o/archipelawow-data-extractor) from a world
  database and a game client, with `TRACKER_OUT_DIR` pointing there. Unlike the player options schema,
  they're committed: the workflows have neither.
- The values written into the server configuration on first launch are in
  [`config-defaults.json`](ArchipelaWoW.Launcher/Resources/config-defaults.json).
