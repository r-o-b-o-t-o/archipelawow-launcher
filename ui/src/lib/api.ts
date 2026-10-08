// Typed wrappers for the launcher's methods, see Bridge/BridgeApi.cs.
import { call } from "./bridge";

export type ServerName = "mysql" | "authserver" | "worldserver";
export type TerminalName = ServerName | "tasks";
export type ServerState = "stopped" | "starting" | "running" | "stopping" | "crashed";
export type FolderTarget = "root" | "configs" | "data" | "logs" | "launcherLogs" | "players" | "mysql";

export interface ServerStatus {
	name: ServerName;
	displayName: string;
	state: ServerState;
	pid: number | null;
	startedAt: string | null;
	exitCode: number | null;
}

export interface TaskInfo {
	title: string;
	stage: string;
	progress: number | null;
	detail: string | null;
	startedAt: string;
}

/** server\release.json, written by the archipelawow-repack workflow. */
export interface ServerManifest {
	version: string;
	build: string;
	builtAt: string;
	repository: string;
	azerothcore: { repository: string; commit: string };
	modules: { name: string; repository: string; commit: string }[];
	mysql: string;
}

export interface AppInfo {
	version: string;
	root: string;
	/** Whether the setup installed the launcher, which then keeps its data in %LocalAppData%\ArchipelaWoW. */
	installedBySetup: boolean;
	windowsBuild: number;
}

export interface LauncherUpdate {
	/** False when the launcher wasn't installed from a release, by its setup or portable archive. */
	supported: boolean;
	/** The newer release, if any. */
	version: string | null;
	/** Whether that release is downloaded, for the launcher to apply when it quits. */
	downloaded: boolean;
}

export interface Settings {
	mySqlPort: number;
	autoStartServers: boolean;
	databaseInitialized: boolean;
	clientDataVersion: string | null;
	wowClientPath: string | null;
	tracker: TrackerSettings;
}

export interface TrackerSettings {
	host: string | null;
	port: number | null;
	slot: string | null;
	password: string | null;
	hideChecked: boolean;
}

export interface ClientDataStatus {
	version: string | null;
	folders: Record<string, boolean>;
	ready: boolean;
}

export interface SetupStatus {
	serverInstalled: boolean;
	/** Null when the server isn't installed, or its release.json is missing or unreadable. */
	server: ServerManifest | null;
	databaseInitialized: boolean;
	configsCreated: boolean;
	clientData: ClientDataStatus;
	/** Longest SQL path worldserver opens, which must stay within the limit. */
	sourcePathLength: number;
	sourcePathLimit: number;
}

export interface RepackArchive {
	build: string;
	size: number;
}

export interface RepackRelease {
	version: string;
	publishedAt: string;
	archives: RepackArchive[];
}

export interface ClientDataRelease {
	tag: string;
	publishedAt: string;
	assetName: string;
	size: number;
	url: string;
}

export interface PlayerFile {
	name: string;
	size: number;
	modified: string;
}

export interface ArchipelagoConnection {
	host: string | null;
	port: number | null;
	password: string | null;
}

export type TrackerStatusName = "disconnected" | "connecting" | "connected";

export interface TrackerStatus {
	status: TrackerStatusName;
	/** Why the last connection attempt failed or the connection was lost. */
	error: string | null;
}

/** An item the slot received, from its own world or another player's. */
export interface TrackerItem {
	/** Its place in the order the room hands the slot's items out. */
	index: number;
	item: number;
	name: string;
	locationName: string;
	/** The slot whose world held the item, 0 for the starting inventory. */
	player: number;
	playerName: string;
}

/** The seed the tracker is connected to. Its slot data is read in tracker/types.ts. */
export interface TrackerSeed {
	playerName: string;
	slotData: unknown;
	itemNames: Record<string, string>;
	/** The slot's locations, by id. */
	locations: Record<string, string>;
	checked: number[];
	items: TrackerItem[];
}

export const api = {
	app: {
		getInfo: () => call<AppInfo>("app.getInfo"),
		openPath: (target: FolderTarget) => call("app.openPath", { target }),
		openUrl: (url: string) => call("app.openUrl", { url }),
		setUnsavedChanges: (unsaved: boolean) => call("app.setUnsavedChanges", { unsaved }),
	},
	launcher: {
		checkForUpdate: () => call<LauncherUpdate>("launcher.checkForUpdate"),
		/** Downloads the update, then quits as closing the window does, asking first if need be, and restarts into it. */
		update: () => call("launcher.update"),
	},
	settings: {
		get: () => call<Settings>("settings.get"),
		update: (patch: Partial<Pick<Settings, "mySqlPort" | "autoStartServers">> & { trackerHideChecked?: boolean }) =>
			call<Settings>("settings.update", patch),
	},
	setup: {
		getStatus: () => call<SetupStatus>("setup.getStatus"),
		initDatabase: () => call<SetupStatus>("setup.initDatabase"),
		createConfigs: (overwrite: boolean) => call<string[]>("setup.createConfigs", { overwrite }),
	},
	repack: {
		getLatestRelease: () => call<RepackRelease>("repack.getLatestRelease"),
		install: (build: string) => call<SetupStatus>("repack.install", { build }),
		delete: () => call<SetupStatus>("repack.delete"),
	},
	clientData: {
		getStatus: () => call<ClientDataStatus>("clientData.getStatus"),
		getLatestRelease: () => call<ClientDataRelease>("clientData.getLatestRelease"),
		download: () => call<ClientDataStatus>("clientData.download"),
		extract: (clientPath: string, generateMmaps: boolean) =>
			call<ClientDataStatus>("clientData.extract", { clientPath, generateMmaps }),
	},
	task: {
		getCurrent: () => call<TaskInfo | null>("task.getCurrent"),
		cancel: () => call("task.cancel"),
	},
	dialog: {
		pickFolder: (title: string, initialDirectory?: string | null) =>
			call<string | null>("dialog.pickFolder", { title, initialDirectory }),
	},
	servers: {
		getAll: () => call<ServerStatus[]>("servers.getAll"),
		start: (name: ServerName) => call("servers.start", { name }),
		stop: (name: ServerName) => call("servers.stop", { name }),
		restart: (name: ServerName) => call("servers.restart", { name }),
		kill: (name: ServerName) => call("servers.kill", { name }),
		startAll: () => call("servers.startAll"),
		stopAll: () => call("servers.stopAll"),
	},
	terminal: {
		snapshot: (name: TerminalName) => call<{ data: string; seq: number }>("terminal.snapshot", { name }),
		input: (name: TerminalName, data: string) => call("terminal.input", { name, data }),
		resize: (name: TerminalName, cols: number, rows: number) => call("terminal.resize", { name, cols, rows }),
		clear: (name: TerminalName) => call("terminal.clear", { name }),
	},
	worldserver: {
		command: (command: string) => call("worldserver.command", { command }),
	},
	accounts: {
		create: (username: string, password: string, gmLevel: number) =>
			call("accounts.create", { username, password, gmLevel }),
	},
	archipelago: {
		getConnection: () => call<ArchipelagoConnection>("archipelago.getConnection"),
		setConnection: (host: string, port: number, password: string) =>
			call<{ reloaded: boolean }>("archipelago.setConnection", { host, port, password }),
	},
	tracker: {
		getStatus: () => call<TrackerStatus>("tracker.getStatus"),
		getSeed: () => call<TrackerSeed | null>("tracker.getSeed"),
		connect: (host: string, port: number, slot: string, password: string) =>
			call<TrackerStatus>("tracker.connect", { host, port, slot, password }),
		disconnect: () => call("tracker.disconnect"),
	},
	players: {
		list: () => call<PlayerFile[]>("players.list"),
		read: (name: string) => call<string>("players.read", { name }),
		write: (name: string, content: string) => call("players.write", { name, content }),
		delete: (name: string) => call("players.delete", { name }),
		import: () => call<string[]>("players.import"),
		export: (name: string) => call<boolean>("players.export", { name }),
	},
	config: {
		list: () => call<string[]>("config.list"),
		read: (name: string) => call<string>("config.read", { name }),
		write: (name: string, content: string) => call("config.write", { name, content }),
	},
};
