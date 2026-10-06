// State pushed by the launcher, shared by every page.
import { createSignal } from "solid-js";
import { api, type AppInfo, type ServerName, type ServerStatus, type TaskInfo } from "./api";
import { inLauncher, on } from "./bridge";

const [servers, setServers] = createSignal<ServerStatus[]>([]);
const [task, setTask] = createSignal<TaskInfo | null>(null);
const [appInfo, setAppInfo] = createSignal<AppInfo | null>(null);
const [shuttingDown, setShuttingDown] = createSignal(false);
// Bumped once the server is installed, updated or deleted: a source for the resources that read its files
const [serverRevision, setServerRevision] = createSignal(1);

export { appInfo, serverRevision, servers, shuttingDown, task };

export const serverChanged = () => setServerRevision((revision) => revision + 1);

export const server = (name: ServerName) => servers().find((s) => s.name === name);

export const isActive = (status: ServerStatus | undefined) =>
	status?.state === "starting" || status?.state === "running" || status?.state === "stopping";

export async function initStore() {
	if (!inLauncher) return;
	on<ServerStatus[]>("servers.changed", setServers);
	on<TaskInfo | null>("task.changed", setTask);
	on("app.shuttingDown", () => setShuttingDown(true));
	const [info, list, current] = await Promise.all([api.app.getInfo(), api.servers.getAll(), api.task.getCurrent()]);
	setAppInfo(info);
	setServers(list);
	setTask(current);
}
