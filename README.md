# 🌍 ArchipelaWoW Launcher

The easiest way to host [ArchipelaWoW](https://github.com/r-o-b-o-t-o/archipelawow) on Windows: a
launcher that installs a ready-to-run build of [AzerothCore](https://www.azerothcore.org/) with the
ArchipelaWoW modules, and edits Archipelago player options.

No development tools, database server or runtime to install: extract the archive and start
`ArchipelaWoW.Launcher.exe`. The launcher downloads the server, sets up the database and the
configuration, gets the client data, runs the servers with their consoles in one window, and keeps the
server up to date. The player options editor works without the server.

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

1. Download `ArchipelaWoW-Launcher-<version>.zip` from the [latest release](../../releases/latest).
2. Extract it close to the root of a drive, e.g. into `C:\Games`. Deep folders don't work: the server
   can't open files whose path is longer than 259 characters, and the launcher warns about it.
3. Start `ArchipelaWoW.Launcher.exe` and follow the setup: the server, the database, the configuration,
   then the client data, which you can download or extract from your own World of Warcraft 3.3.5a
   client.
4. Start the servers from the dashboard, create a game account there, and set `set realmlist 127.0.0.1`
   in your client's `Data\<locale>\realmlist.wtf`.

To only make player options, skip the setup and open **Player options**.

It runs on 64-bit Windows 10 (1809 or later) and 11. The interface uses the Microsoft Edge WebView2
Runtime, which comes with Windows 11 and up-to-date Windows 10; the launcher links to its installer
when it's missing.

The whole folder is portable: move it and it keeps working.

### Updating

The server's card in the settings shows when a new server release is out. Updating it keeps the
databases, configuration, client data and player options, and the server applies the new database
updates when it starts. The same card switches to another build of the server, or deletes the server
with its databases, configuration, client data and logs.

To update the launcher, close it and extract the new release to the same place, replacing files.

Coming from a release that had the server in it (the ones numbered by date, like 2026.10.3.2): extract
the launcher over it the same way, then update the server from the settings. The `release.json` left at
the root of the folder is no longer used, nor are the server's licenses left in `licenses` (AzerothCore,
OpenSSL, the modules and `AzerothCore dependencies`): the current ones are in `server\licenses`.

### What's in the folder

| Path | Contents |
| --- | --- |
| `ArchipelaWoW.Launcher.exe` | The launcher |
| `licenses` | The licenses of the software the launcher is built with |
| `launcher` | The launcher's settings, logs (including the MySQL and tasks consoles) and downloads |
| `players` | Archipelago player options (YAML) |
| `server\bin` | authserver, worldserver, dbimport, the client data extractors, and `configs\` |
| `server\source` | The SQL files the server builds and updates its databases from |
| `server\licenses` | The licenses of the software in the server, besides MySQL's, which are in `mysql` |
| `server\release.json` | What the server was built from: versions and commits |
| `server\data`, `server\logs` | Client data and server logs, created by the launcher |
| `mysql` | MySQL Community Server; `mysql\data` holds the databases |

`server` and `mysql` come from the [server releases](https://github.com/r-o-b-o-t-o/archipelawow-repack/releases),
built by [archipelawow-repack](https://github.com/r-o-b-o-t-o/archipelawow-repack).

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
- The values written into the server configuration on first launch are in
  [`config-defaults.json`](ArchipelaWoW.Launcher/Resources/config-defaults.json).
