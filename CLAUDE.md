# CLAUDE.md

ArchipelaWoW Launcher: a WPF (.NET 10) window hosting a SolidJS UI (`ui`) in WebView2, released with
Velopack as a setup and a portable archive, and updating itself. It installs the server (a prebuilt
AzerothCore, the ArchipelaWoW modules and MySQL) from `archipelawow-repack` releases; `README.md` covers
the layout and development commands.

## Related repositories

- `archipelawow-repack` — builds the server archives. `RepackService` relies on their names
  (`ArchipelaWoW-Repack-<build>-<version>.zip`), their layout (`server/`, `mysql/`) and
  `server/release.json`; change them together.
- `mod-i-found-your-sword` — the AzerothCore module. The launcher edits its `archipelawow.conf`
  connection keys; renaming them needs a matching change on the other side.
- `archipelawow` — the apworld. `scripts/dump-options-schema.py` turns its newest release's options
  (pre-releases included) into the schema the YAML editor renders; a new option type needs support
  there and in `OptionField.tsx`. It loads `options.py` alone, so that file can't import the rest of
  the world. The tracker reads its slot data (`fill_slot_data` in `world.py`), its rules included
  (`logic_export.py`): `ui/src/tracker/types.ts` holds the shape, change them together.
- `archipelawow-data-extractor` — writes the tracker's maps, positions and icons to `ui/public/tracker`.
  Never hand-edit them: change the extractor and regenerate. Their shape is in `ui/src/tracker/types.ts`.

## Code

- Write straightforward code. Skip minor edge cases; point out notable ones and let the user decide
  whether they are worth handling.
- Comment only when the code isn't obvious or there is an implication a future maintainer could
  easily miss. Keep comments brief and don't restate the code.
- No machine-specific paths or credentials in committed files.
- Generated files (the UI's `options-schema.json`) aren't committed or given a fallback: if generating
  fails, so does the build or release. The tracker's extracts are the exception: they're read from a
  world database and a game client, which the workflows don't have.
- `Bridge/BridgeApi.cs` and `ui/src/lib/api.ts` match methods and events by name: change them
  together.
- In `ui`:
  - Format with `npm run format` (Prettier).
  - Tailwind doesn't settle conflicting utilities by class order: shared class strings leave sizes out
    (`inputBase`).
  - Solid creates module-level JSX once: share elements through factories.

## Running the servers

- The servers run from `server`, not `server/bin`: on Windows the core reads `configs/` in its working
  directory, and `-c` only moves the main file, not the module configs. `config-defaults.json` keeps every path
  relative to it so the folder stays portable. `RepackService.MoveOutOfServerBin` moves the configs of
  older installations and releases out of `server/bin/configs`, rebasing their paths.
- The database updater opens SQL files as `server\source\...` and isn't long-path aware: past
  259 characters they fail to open. The launcher warns (`RepackService.LongestSourcePath`); keep SQL
  file and module names short.
- The servers create the databases they miss: `ServerManager` sets `AC_DISABLE_INTERACTIVE=1`, without
  which they ask on their console first and wait. The authserver and the worldserver would both create
  the login database: for this and the reason below, `ServerManager` starts neither while the other
  starts.
- Since AzerothCore #26658 the authserver flags every realm offline when it starts, which hides the
  realms also flagged "version mismatch", as a worldserver leaves its own from when it has set up its
  databases until it's started, or for good if it dies while starting; with none left, the authserver
  exits. `ServerManager` clears the version mismatch flag before starting the authserver, and
  `UpdateUptimeInterval` has a running worldserver clear the offline flag within a minute.
- The servers run under ConPTY: on a pipe the CRT block-buffers their output.
- ConPTY rewrites the last character of a wrapped line after moving the cursor, doubling it in the
  escape-stripped logs of `launcher/logs`: known, cosmetic.

## Updating the launcher

- Velopack replaces `current\` (the launcher), `Update.exe` and the exe that starts the launcher, and
  leaves the data alone. Applying an update first kills whatever runs from the installation folder, the
  servers of a portable launcher included: `LauncherUpdater` only applies one when the launcher restarts
  to update, once it has stopped the servers. Never silently on quit: a launcher started again meanwhile
  would be killed, with the servers it starts.
- Velopack's uninstaller, and its setup run over an installation, empty the setup's installation folder:
  the setup's launcher keeps its data in `%LocalAppData%\ArchipelaWoW` (`LauncherUpdater.DefaultRoot`).
- The release workflow's `--packId` names the setup's installation folder, its entry in Windows'
  installed apps and the assets: never change it. `--packTitle` names the exe next to `current\` and the
  shortcuts.

## Verifying changes

- No test suite: run the launcher on a real installation (`subst` a drive letter onto it if its path
  is long), made of:
  - `server/bin`: a core build with `libmysql.dll` and the OpenSSL DLLs, `legacy.dll` included. The
    launcher moves the build's `configs/` to `server/configs`.
  - `server/source` and `mysql/{bin,lib,share}`: junctions to an AzerothCore checkout and a MySQL 8.4
    install. Installing or deleting the server from the launcher replaces or removes the junctions,
    not what they point to.
  - `launcher/settings.json` setting a free `mySqlPort`: 3306 is often taken.
- Start it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` to drive and
  screenshot the UI over the Chrome DevTools Protocol.
- Check player options changes by generating a seed from a saved YAML with Archipelago's
  `Generate.py`.
- Check tracker changes against a seed hosted with `MultiServer.py --disable_save`. A script connecting
  as the slot's game and sending `LocationChecks` gives it items and checks. Check logic changes against
  Archipelago's: the locations it finds reachable for a set of items must match the tracker's exactly.
- Check launcher update changes on a portable build updating from a local feed
  (`ARCHIPELAWOW_UPDATE_FEED`, see the README), not on a setup install: it adds shortcuts and an
  installed app.
- The workflows only run on GitHub: at least parse their `run:` blocks with PowerShell.

## Commits

- Conventional Commits with concise messages; one logical change per commit.
