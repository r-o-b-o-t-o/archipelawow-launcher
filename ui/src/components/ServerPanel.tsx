import { createResource, createSignal, Show } from "solid-js";
import { api, type SetupStatus } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { isActive, serverChanged, servers, task } from "../lib/store";
import { attempt, errorMessage } from "../lib/toast";
import { Badge, Button, Callout, Field, Select } from "./ui";

/** Installs the server from the latest archipelawow-repack release, updates it, or deletes it. */
export default function ServerPanel(props: { status: SetupStatus | undefined }) {
	const [release] = createResource(api.repack.getLatestRelease);
	const [chosenBuild, setChosenBuild] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal<"install" | "delete" | null>(null);

	// Reading a resource that failed throws
	const latest = () => (release.error ? undefined : release());
	const installed = () => props.status?.serverInstalled ?? false;
	const manifest = () => props.status?.server ?? null;
	const archives = () => latest()?.archives ?? [];
	// The installed build unless another is picked, so that updating keeps it
	const build = () =>
		chosenBuild() ?? (archives().find((a) => a.build === manifest()?.build) ?? archives()[0])?.build ?? null;
	const updateAvailable = () => installed() && latest() !== undefined && manifest()?.version !== latest()!.version;
	const upToDate = () => installed() && latest() !== undefined && !updateAvailable() && manifest()?.build === build();
	const anyActive = () => servers().some(isActive);
	const blocked = () => task() !== null || anyActive();

	const install = async () => {
		setBusy("install");
		await attempt(
			() => api.repack.install(build()!),
			installed() ? "The server is up to date." : "The server is installed.",
		);
		setBusy(null);
		// Even a failed update may have replaced some files
		serverChanged();
	};

	const remove = async () => {
		if (
			!confirm(
				"Delete the server? This deletes the server programs, the databases (game accounts and characters), " +
					"the configuration, the client data and the logs. The player options stay.",
			)
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
						variant={upToDate() ? "secondary" : "primary"}
						icon="download"
						busy={busy() === "install"}
						disabled={blocked() || build() === null}
						onClick={install}
					>
						{installed() ? (upToDate() ? "Reinstall" : "Update") : "Download and install"}
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
			</div>
		</div>
	);
}
