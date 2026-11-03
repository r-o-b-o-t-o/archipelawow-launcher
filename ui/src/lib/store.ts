// State pushed by the launcher, shared by every page.
import { createSignal } from "solid-js";

import { type AppInfo, type LauncherUpdate, type ServerName, type ServerStatus, type TaskInfo, api } from "./api";
import { inLauncher, on } from "./bridge";
import { errorMessage } from "./toast";

const [servers, setServers] = createSignal<ServerStatus[]>([]);
const [task, setTask] = createSignal<TaskInfo | null>(null);
const [appInfo, setAppInfo] = createSignal<AppInfo | null>(null);
const [shuttingDown, setShuttingDown] = createSignal(false);
// Bumped once the server is installed, updated or deleted: a source for the resources that read its files
const [serverRevision, setServerRevision] = createSignal(1);
const [launcherUpdate, setLauncherUpdate] = createSignal<LauncherUpdate | null>(null);
const [launcherUpdateError, setLauncherUpdateError] = createSignal<string | null>(null);
// The latest server release's version while the installed server is older, null otherwise
const [serverUpdate, setServerUpdate] = createSignal<string | null>(null);

export { appInfo, launcherUpdate, launcherUpdateError, serverRevision, serverUpdate, servers, shuttingDown, task };

export const serverChanged = () => {
	setServerRevision((revision) => revision + 1);
	void checkServerUpdate();
};

// Release versions are numbers joined by dots, e.g. 2026.10.6.12: compared number by number
export const compareVersions = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export const server = (name: ServerName) => servers().find((s) => s.name === name);

export const isActive = (status: ServerStatus | undefined) =>
	status?.state === "starting" || status?.state === "running" || status?.state === "stopping";

/** Looks for a launcher update. The launcher answers with what it found within the last 10 minutes. */
export async function checkLauncherUpdate() {
	try {
		setLauncherUpdate(await api.launcher.checkForUpdate());
		setLauncherUpdateError(null);
	} catch (error) {
		setLauncherUpdateError(errorMessage(error));
	}
}

/**
 * Compares the installed server with the latest archipelawow-repack release, which the launcher caches for 10 minutes.
 * An installed server of unknown version counts as outdated, as on the setup page.
 */
export async function checkServerUpdate() {
	try {
		const status = await api.setup.getStatus();
		if (!status.serverInstalled) {
			setServerUpdate(null);
			return;
		}
		const latest = await api.repack.getLatestRelease();
		const installed = status.server?.version;
		setServerUpdate(
			installed === undefined || compareVersions(latest.version, installed) > 0 ? latest.version : null,
		);
	} catch {
		// Kept as it was: the setup page tells why the lookup failed
	}
}

const updateCheckInterval = 30 * 60 * 1000;

export async function initStore() {
	if (!inLauncher) return;
	on<ServerStatus[]>("servers.changed", setServers);
	on<TaskInfo | null>("task.changed", setTask);
	on("app.shuttingDown", () => setShuttingDown(true));
	const [info, list, current] = await Promise.all([api.app.getInfo(), api.servers.getAll(), api.task.getCurrent()]);
	setAppInfo(info);
	setServers(list);
	setTask(current);
	// Not awaited: GitHub may take a while to answer. Looked up again for the releases published while the launcher stays
	// open.
	const checkUpdates = () => {
		void checkLauncherUpdate();
		void checkServerUpdate();
	};
	checkUpdates();
	setInterval(checkUpdates, updateCheckInterval);
}
