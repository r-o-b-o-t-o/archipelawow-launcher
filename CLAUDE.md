# CLAUDE.md

ArchipelaWoW Launcher: a WPF (.NET 10) window hosting a SolidJS UI (`src/ui`) in WebView2. Releases
bundle it with a prebuilt AzerothCore, the ArchipelaWoW modules and MySQL as a portable folder;
`README.md` covers the layout and development commands.

## Related repositories

- `mod-i-found-your-sword` — the AzerothCore module. The launcher edits its `archipelawow.conf`
  connection keys and pre-creates its database; the module finds its SQL by its directory name, so the
  workflow clones modules into `modules/<repository name>`. Renaming any of these needs a matching
  change on the other side.
- `archipelawow` — the apworld. `scripts/dump-options-schema.py` turns its latest release's options
  into the schema the YAML editor renders; a new option type needs support there and in
  `OptionField.tsx`. It loads `options.py` alone, so that file can't import the rest of the world.

## Code

- Write straightforward code. Skip minor edge cases; point out notable ones and let the user decide
  whether they are worth handling.
- Comment only when the code isn't obvious or there is an implication a future maintainer could
  easily miss. Keep comments brief and don't restate the code.
- No machine-specific paths or credentials in committed files.
- The product is "ArchipelaWoW Launcher"; "repack" only means the prebuilt server build it bundles.
- Generated files (the UI's `options-schema.json`) aren't committed or given a fallback: if generating
  fails, so does the build or release.
- `Bridge/BridgeApi.cs` and `src/ui/src/lib/api.ts` match methods and events by name: change them
  together.
- In `src/ui`:
  - Format with `npm run format` (Prettier).
  - Tailwind doesn't settle conflicting utilities by class order: shared class strings leave sizes out
    (`inputBase`).
  - Solid creates module-level JSX once: share elements through factories.

## Running the servers

- The servers run from `server/bin`, reading `configs/` there; `config-defaults.json` keeps every path
  relative to it so the folder stays portable.
- The database updater opens SQL files as `server\bin\..\source\...` and isn't long-path aware: past
  259 characters they fail to open. The launcher warns (`AppServices.LongestSourcePath`); keep SQL file
  and module names short.
- Ship `data/sql/archive`: the base schemas list its updates as applied, and missing files are reported
  on every start.
- The servers create the databases they miss: `ServerManager` sets `AC_DISABLE_INTERACTIVE=1`, without
  which they ask on their console first and wait. Both would create the login database: an authserver
  start waits for a worldserver creating it, and a worldserver start for a starting authserver.
- Since AzerothCore #26658 the authserver flags every realm offline when it starts, which hides the
  realms also flagged "version mismatch", as a worldserver leaves its own until it's started, or for good
  if it dies while starting; with none left, the authserver exits. `ServerManager` clears that flag
  before starting it and has a worldserver start wait for a starting authserver, and
  `UpdateUptimeInterval` has a running worldserver clear the offline flag within a minute.
- The servers run under ConPTY: on a pipe the CRT block-buffers their output.
- ConPTY rewrites the last character of a wrapped line after moving the cursor, doubling it in the
  escape-stripped logs of `launcher/logs`: known, cosmetic.

## Verifying changes

- No test suite: run the launcher on a real installation (`subst` a drive letter onto it if its path
  is long), made of:
  - `server/bin`: a core build with its `configs/`, `libmysql.dll` and the OpenSSL DLLs, `legacy.dll`
    included.
  - `server/source` and `mysql/{bin,lib,share}`: junctions to an AzerothCore checkout and a MySQL 8.4
    install.
  - `launcher/settings.json` setting a free `mySqlPort`: 3306 is often taken.
- Start it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` to drive and
  screenshot the UI over the Chrome DevTools Protocol.
- Check player options changes by generating a seed from a saved YAML with Archipelago's
  `Generate.py`.
- `scripts/package.ps1` has to stay runnable under Windows PowerShell 5.1 for local runs; against a
  Debug core build, its dependency check fails on the debug C runtime, as expected.
- The workflow only runs on GitHub: at least parse its `run:` blocks with PowerShell.

## Commits

- Conventional Commits with concise messages; one logical change per commit.
