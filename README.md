# 🌍 ArchipelaWoW Launcher

The easiest way to host [ArchipelaWoW](https://github.com/r-o-b-o-t-o/archipelawow) on Windows: a
launcher bundled with a ready-to-run build of [AzerothCore](https://www.azerothcore.org/) and the
ArchipelaWoW modules.

No development tools, database server or runtime to install: extract the archive and start
`ArchipelaWoW.Launcher.exe`. The launcher sets up the database and the configuration on first launch,
gets the client data, runs the servers with their consoles in one window, and edits Archipelago player
options.

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
   can't open files whose path is longer than 260 characters, and the launcher warns about it.
3. Start `ArchipelaWoW.Launcher.exe` and follow the setup: database, configuration, then the client
   data, which you can download or extract from your own World of Warcraft 3.3.5a client.
4. Start the servers from the dashboard, create a game account there, and set `set realmlist 127.0.0.1`
   in your client's `Data\<locale>\realmlist.wtf`.

It runs on 64-bit Windows 10 (1809 or later) and 11. The interface uses the Microsoft Edge WebView2
Runtime, which comes with Windows 11 and up-to-date Windows 10; the launcher links to its installer
when it's missing.

The whole folder is portable: move it and it keeps working.

To update, close the launcher, delete the `server\source` folder, and extract the new release to the
same place, replacing files. The database, configuration, client data and player options are not part
of the archive, so they stay as they are, and the server applies the new database updates when it
starts. `server\source` only holds files from the release, and leftovers of the old one would confuse
the database updater when AzerothCore renames an update.

### What's in the folder

| Path | Contents |
| --- | --- |
| `ArchipelaWoW.Launcher.exe` | The launcher |
| `release.json` | What the release was built from: versions and commits |
| `server\bin` | authserver, worldserver, dbimport, the client data extractors, and `configs\` |
| `server\source` | The SQL files the server builds and updates its databases from |
| `server\data`, `server\logs` | Client data and server logs, created by the launcher |
| `mysql` | MySQL Community Server; `mysql\data` holds the databases |
| `launcher` | The launcher's settings and logs, including the MySQL and tasks consoles |
| `players` | Archipelago player options (YAML) |

MySQL listens on `127.0.0.1:3310` only (the port can be changed in the settings), with the user `acore`
and the password `acore`, for tools such as HeidiSQL or Keira3.

## 📦 Releases

[`repack.yml`](.github/workflows/repack.yml) builds a release every Saturday at 06:45 (Paris time), and
on demand from the Actions tab. It builds the latest AzerothCore with the modules listed at the top of
the workflow, bundles MySQL and the launcher, publishes the archive, and deletes all but the latest
three releases it made.

To add a module, add its repository to `MODULES`, optionally followed by a branch or tag.

The player options editor follows the latest release of the apworld, whose options the workflow turns
into a schema with [`scripts/dump-options-schema.py`](scripts/dump-options-schema.py). When that fails,
so does the release.

To be told on Discord when a release fails, add a `DISCORD_WEBHOOK_URL` repository secret holding the
URL of a channel's webhook.

## 🛠️ Development

The launcher is a WPF window (.NET 10) hosting a WebView2 that shows a SolidJS interface. They talk
over WebView2 web messages ([`BridgeApi.cs`](src/ArchipelaWoW.Launcher/Bridge/BridgeApi.cs) on one side,
[`api.ts`](src/ui/src/lib/api.ts) on the other). The servers run in pseudoconsoles (ConPTY), which the
interface shows with xterm.js.

Requirements: the .NET 10 SDK, Node.js 22 and Python 3.11 or later.

1. **Generate the player options schema**, which the interface needs and the repository doesn't hold.
   It takes a checkout of [Archipelago](https://github.com/ArchipelagoMW/Archipelago) and of the
   apworld (or an extracted `.apworld`):

   ```bash
   pip install PyYAML schema typing_extensions pathspec
   python scripts/dump-options-schema.py --archipelago <Archipelago> --world <archipelawow> --output src/ui/src/data/options-schema.json
   ```

2. **Run the interface** from the Vite dev server:

   ```bash
   cd src/ui
   npm install
   npm run dev
   ```

3. **Start the launcher** on an installation folder, loading the interface from the dev server:

   ```bash
   dotnet run --project src/ArchipelaWoW.Launcher -- --root <installation folder> --dev-server http://localhost:5173
   ```

A Release build embeds the interface, building it first:

```bash
dotnet publish src/ArchipelaWoW.Launcher -c Release -o publish
```

- The interface is formatted with Prettier: `npm run format` in `src/ui`.
- The values written into the server configuration on first launch are in
  [`config-defaults.json`](src/ArchipelaWoW.Launcher/Resources/config-defaults.json).
- [`scripts/package.ps1`](scripts/package.ps1) assembles the portable folder from a built core, MySQL
  and the launcher, as the workflow does.
