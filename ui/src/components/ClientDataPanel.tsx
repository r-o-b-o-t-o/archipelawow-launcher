import { For, Show, createResource, createSignal } from "solid-js";

import { type ClientDataStatus, api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { loaded } from "../lib/resource";
import { isActive, server, serverRevision, task } from "../lib/store";
import { attempt } from "../lib/toast";
import Icon from "./Icon";
import { Button, Callout, Switch } from "./ui";

// The ones worldserver requires first
const FOLDERS = ["dbc", "maps", "vmaps", "mmaps", "Cameras"];

/** Installs the client data worldserver needs, by download or by extraction from the user's client. */
export default function ClientDataPanel(props: {
	serverInstalled: boolean;
	onChange?: (status: ClientDataStatus) => void;
}) {
	const [status, { mutate }] = createResource(serverRevision, api.clientData.getStatus);
	const [release] = createResource(api.clientData.getLatestRelease);
	const [settings] = createResource(api.settings.get);
	const [chosenPath, setChosenPath] = createSignal<string | null>(null);
	const [generateMmaps, setGenerateMmaps] = createSignal(true);

	const latest = () => loaded(release);
	const clientPath = () => chosenPath() ?? settings()?.wowClientPath ?? null;
	const blocked = () => task() !== null || isActive(server("worldserver"));

	const finish = (result: ClientDataStatus | undefined) => {
		if (!result) return;
		mutate(result);
		props.onChange?.(result);
	};

	const pickFolder = async () => {
		const path = await attempt(() =>
			api.dialog.pickFolder("Choose your World of Warcraft 3.3.5a folder", clientPath()),
		);
		if (path) setChosenPath(path);
	};

	return (
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-2">
				<For each={status() ? FOLDERS.map((folder) => [folder, status()!.folders[folder]] as const) : []}>
					{([folder, present]) => (
						<span
							class={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs ${
								present
									? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
									: "border-white/10 bg-surface-1 text-zinc-500"
							}`}
						>
							<Icon name={present ? "check" : "x"} class="size-3" />
							{folder}
						</span>
					)}
				</For>
				<Show when={status()?.version}>
					<span class="ml-auto text-xs text-zinc-500">
						Installed:{" "}
						{status()!.version === "extracted" ? "extracted from your client" : status()!.version}
					</span>
				</Show>
			</div>

			<Show when={isActive(server("worldserver"))}>
				<Callout tone="amber">
					Stop the worldserver before replacing the client data, it keeps those files open.
				</Callout>
			</Show>

			<div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
				<div class="flex flex-col rounded-lg border border-white/10 bg-surface-1 p-4">
					<div class="flex items-center gap-2 font-display text-zinc-100">
						<Icon name="download" class="size-4 text-gold" />
						Download
					</div>
					<p class="mt-2 text-[13px] text-zinc-400">
						Ready-made files from the{" "}
						<a
							class="text-gold hover:underline"
							href="https://github.com/wowgaming/client-data/releases"
							target="_blank"
						>
							wowgaming/client-data
						</a>{" "}
						project, matching recent AzerothCore versions. The quickest and easiest way.
					</p>
					<div class="mt-3 text-xs text-zinc-500">
						<Show
							when={latest()}
							fallback={
								release.error
									? "Couldn't reach GitHub to look up the latest release."
									: "Looking up the latest release..."
							}
						>
							{(latest) => (
								<>
									Release {latest().tag}, {formatBytes(latest().size)}, published{" "}
									{formatDate(latest().publishedAt)}
								</>
							)}
						</Show>
					</div>
					<Button
						variant="primary"
						icon="download"
						class="mt-4 self-start"
						disabled={blocked()}
						onClick={async () => finish(await attempt(api.clientData.download, "Client data installed."))}
					>
						Download and install
					</Button>
				</div>

				<div class="flex flex-col items-center gap-2 text-xs text-zinc-500">
					<div class="w-px flex-1 bg-white/10" />
					OR
					<div class="w-px flex-1 bg-white/10" />
				</div>

				<div class="flex flex-col rounded-lg border border-white/10 bg-surface-1 p-4">
					<div class="flex items-center gap-2 font-display text-zinc-100">
						<Icon name="package" class="size-4 text-gold" />
						Extract from your client
					</div>
					<p class="mt-2 text-[13px] text-zinc-400">
						Runs AzerothCore's extractors on your own World of Warcraft 3.3.5a (12340) installation. Only
						worth it on a slow or metered connection, or if you know what you're doing.
						<Show when={!props.serverInstalled}>
							{" "}
							The extractors come with the server: install it first.
						</Show>
					</p>
					<div class="mt-3 flex items-center gap-2">
						<Button size="sm" icon="folder" disabled={blocked()} onClick={pickFolder}>
							Choose folder
						</Button>
						<span
							class="min-w-0 truncate font-mono text-xs text-zinc-400"
							data-tooltip={clientPath() ?? undefined}
						>
							{clientPath() ?? "No folder chosen"}
						</span>
					</div>
					<div class="mt-3">
						<Switch
							checked={generateMmaps()}
							onChange={setGenerateMmaps}
							label={
								<span class="text-[13px]">
									Generate movement maps <span class="text-zinc-500">(mmaps, takes a few hours)</span>
								</span>
							}
						/>
					</div>
					<Button
						variant="primary"
						icon="package"
						class="mt-4 self-start"
						disabled={blocked() || !clientPath() || !props.serverInstalled}
						onClick={async () =>
							finish(
								await attempt(
									() => api.clientData.extract(clientPath()!, generateMmaps()),
									"Client data extracted.",
								),
							)
						}
					>
						Extract
					</Button>
				</div>
			</div>
		</div>
	);
}
