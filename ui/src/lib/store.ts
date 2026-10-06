// State pushed by the launcher, shared by every page.
import { createSignal } from "solid-js";
import { api, type AppInfo, type LauncherUpdate, type ServerName, type ServerStatus, type TaskInfo } from "./api";
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

export { appInfo, launcherUpdate, launcherUpdateError, serverRevision, servers, shuttingDown, task };

export const serverChanged = () => setServerRevision((revision) => revision + 1);

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

export async function initStore() {
	if (!inLauncher) return;
	on<ServerStatus[]>("servers.changed", setServers);
	on<TaskInfo | null>("task.changed", setTask);
	on("app.shuttingDown", () => setShuttingDown(true));
	const [info, list, current] = await Promise.all([api.app.getInfo(), api.servers.getAll(), api.task.getCurrent()]);
	setAppInfo(info);
	setServers(list);
	setTask(current);
	// Not awaited: GitHub may take a while to answer
	void checkLauncherUpdate();
}
