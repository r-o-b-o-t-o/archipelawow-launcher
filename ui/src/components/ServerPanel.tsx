import { Show, createResource, createSignal } from "solid-js";

import { type SetupStatus, api } from "../lib/api";
import { confirmDialog } from "../lib/dialog";
import { formatBytes, formatDate } from "../lib/format";
import { loaded } from "../lib/resource";
import { isActive, serverChanged, servers, task } from "../lib/store";
import { attempt, errorMessage } from "../lib/toast";
import { Badge, Button, Callout, Field, Select } from "./ui";

// Release versions are numbers joined by dots, e.g. 2026.10.6.12: compared number by number
const compareVersions = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
// Offered when no build is installed. GitHub lists the archives by name, which puts it after "playerbots".
const defaultBuild = "standard";

/** Installs the server from the latest archipelawow-repack release, updates it, or deletes it. */
export default function ServerPanel(props: { status: SetupStatus | undefined }) {
	const [release] = createResource(api.repack.getLatestRelease);
	const [chosenBuild, setChosenBuild] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal<"install" | "delete" | null>(null);

	const latest = () => loaded(release);
	const installed = () => props.status?.serverInstalled ?? false;
	const manifest = () => props.status?.server ?? null;
	const archives = () => latest()?.archives ?? [];
	const installedBuild = () => (installed() ? manifest()?.build : undefined);
	// Gone from the latest release, the installed build is only replaced by one picked on purpose
	const installedBuildGone = () =>
		installedBuild() !== undefined &&
		latest() !== undefined &&
		!archives().some((a) => a.build === installedBuild());
	const preferredArchive = () =>
		archives().find((a) => a.build === (installedBuild() ?? defaultBuild)) ?? archives()[0];
	// The installed build unless another is picked, so that updating keeps it
	const build = () => chosenBuild() ?? (installedBuildGone() ? null : (preferredArchive()?.build ?? null));
	// Positive when the latest release is newer, which an unknown installed version counts as
	const versionOrder = () => {
		const [installedVersion, latestVersion] = [manifest()?.version, latest()?.version];
		if (latestVersion === undefined) return 0;
		return installedVersion === undefined ? 1 : compareVersions(latestVersion, installedVersion);
	};
	const updateAvailable = () => installed() && versionOrder() > 0;
	const action = () => {
		if (!installed()) return "Download and install";
		// Nothing to compare with until the latest release is known
		if (latest() === undefined) return "Update";
		if (installedBuild() !== undefined && build() !== installedBuild()) return "Switch build";
		return versionOrder() > 0 ? "Update" : versionOrder() < 0 ? "Downgrade" : "Reinstall";
	};
	const anyActive = () => servers().some(isActive);
	const blocked = () => task() !== null || anyActive();

	const install = async () => {
		if (
			action() === "Downgrade" &&
			!(await confirmDialog({
				title: "Downgrade the server",
				message:
					"The latest release is older than the installed server, and may not handle the database updates " +
					"the installed one applied. Install it anyway?",
				confirm: "Install",
				danger: true,
			}))
		)
			return;
		setBusy("install");
		await attempt(
			() => api.repack.install(build()!),
			action() === "Update" ? "The server is up to date." : "The server is installed.",
		);
		setBusy(null);
		// Even a failed update may have replaced some files
		serverChanged();
	};

	const remove = async () => {
		if (
			!(await confirmDialog({
				title: "Delete the server",
				message:
					"This deletes the server programs, the databases (game accounts and characters), the " +
					"configuration, the client data and the logs. The player options stay.",
				confirm: "Delete",
				danger: true,
			}))
		)
			return;
		setBusy("delete");
		await attempt(api.repack.delete, "The server is deleted.");
		setBusy(null);
		serverChanged();
	};

	return (
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-2 text-[13px]">
				<Show when={installed()} fallback={<span class="text-zinc-400">Not installed</span>}>
					<span class="text-zinc-200">
						<Show when={manifest()} fallback="Installed, version unknown">
							{(m) => (
								<>
									Version {m().version}, {m().build} build, built {formatDate(m().builtAt)}
								</>
							)}
						</Show>
					</span>
					<Show when={updateAvailable()}>
						<Badge tone="amber">Update available</Badge>
					</Show>
				</Show>
			</div>

			<Show when={anyActive()}>
				<Callout tone="amber">Stop the servers before installing, updating or deleting the server.</Callout>
			</Show>

			<div class="flex flex-col rounded-lg border border-white/10 bg-surface-1 p-4">
				<p class="text-[13px] text-zinc-400">
					AzerothCore with the ArchipelaWoW modules, and the MySQL database server, built every week by the{" "}
					<a
						class="text-gold hover:underline"
						href="https://github.com/r-o-b-o-t-o/archipelawow-repack/releases"
						target="_blank"
					>
						archipelawow-repack
					</a>{" "}
					project. Updating keeps the databases, the configuration and the client data.
				</p>
				<div class="mt-3 text-xs text-zinc-500">
					<Show
						when={latest()}
						fallback={
							release.error
								? `Couldn't look up the latest release: ${errorMessage(release.error)}`
								: "Looking up the latest release..."
						}
					>
						{(release) => (
							<>
								Latest release {release().version}, published {formatDate(release().publishedAt)}
							</>
						)}
					</Show>
				</div>
				<div class="mt-4 flex items-end gap-3">
					<Field label="Build" class="w-64">
						<Select
							value={build() ?? ""}
							onChange={setChosenBuild}
							disabled={blocked() || archives().length === 0}
							options={archives().map((a) => ({
								value: a.build,
								label: `${a.build} (${formatBytes(a.size)})`,
							}))}
						/>
					</Field>
					<Button
						variant={action() === "Reinstall" || action() === "Downgrade" ? "secondary" : "primary"}
						icon="download"
						busy={busy() === "install"}
						disabled={blocked() || build() === null}
						onClick={install}
					>
						{action()}
					</Button>
					<Show when={installed()}>
						<Button
							variant="danger"
							icon="trash"
							class="ml-auto"
							busy={busy() === "delete"}
							disabled={blocked()}
							onClick={remove}
						>
							Delete the server
						</Button>
					</Show>
				</div>
				<Show when={installedBuildGone()}>
					<p class="mt-2 text-xs text-amber-300">
						The latest release has no {installedBuild()} build anymore: pick another one to switch to it.
					</p>
				</Show>
			</div>
		</div>
	);
}
