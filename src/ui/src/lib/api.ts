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

/** release.json, written by the release workflow. */
export interface ReleaseManifest {
	version: string;
	builtAt: string;
	repository: string;
	azerothcore: { repository: string; commit: string };
	modules: { name: string; repository: string; commit: string }[];
	mysql: string;
	apworld: string;
}

export interface AppInfo {
	version: string;
	root: string;
	windowsBuild: number;
	manifest: ReleaseManifest | null;
}

export interface Settings {
	mySqlPort: number;
	autoStartServers: boolean;
	databaseInitialized: boolean;
	clientDataVersion: string | null;
	wowClientPath: string | null;
}

export interface ClientDataStatus {
	version: string | null;
	folders: Record<string, boolean>;
	ready: boolean;
}

export interface SetupStatus {
	serverInstalled: boolean;
	mySqlInstalled: boolean;
	databaseInitialized: boolean;
	configsCreated: boolean;
	clientData: ClientDataStatus;
	/** Longest SQL path worldserver opens, which must stay within the limit. */
	sourcePathLength: number;
	sourcePathLimit: number;
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

export const api = {
	app: {
		getInfo: () => call<AppInfo>("app.getInfo"),
		openPath: (target: FolderTarget) => call("app.openPath", { target }),
		openUrl: (url: string) => call("app.openUrl", { url }),
	},
	settings: {
		get: () => call<Settings>("settings.get"),
		update: (patch: Partial<Pick<Settings, "mySqlPort" | "autoStartServers">>) =>
			call<Settings>("settings.update", patch),
	},
	setup: {
		getStatus: () => call<SetupStatus>("setup.getStatus"),
		initDatabase: () => call<SetupStatus>("setup.initDatabase"),
		createConfigs: (overwrite: boolean) => call<string[]>("setup.createConfigs", { overwrite }),
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
