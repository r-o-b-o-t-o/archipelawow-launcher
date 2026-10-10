import { Show, createEffect, createResource, createSignal, on } from "solid-js";

import { Button, Callout, Card, Code, Field, IconButton, PageHeader, Select } from "../components/ui";
import { type ApWorldRelease, api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { schema } from "../lib/playerOptions";
import { loaded } from "../lib/resource";
import { attempt } from "../lib/toast";

const versionOf = (release: ApWorldRelease) => release.tag.replace(/^v/, "");

export default function ApWorld() {
	const [status, { refetch, mutate }] = createResource(api.apworld.getStatus);
	const [releases] = createResource(api.apworld.getReleases);
	const [tag, setTag] = createSignal("");
	const [installing, setInstalling] = createSignal(false);

	// The release the player options editor follows, so that its YAML files fit
	createEffect(
		on(
			() => loaded(releases),
			(list) => {
				if (list?.length && !tag())
					setTag((list.find((r) => versionOf(r) === schema.worldVersion) ?? list[0]).tag);
			},
		),
	);
	const selected = () => loaded(releases)?.find((r) => r.tag === tag());
	const archipelago = () => status()?.archipelago;
	const installed = () => status()?.installed;

	const install = async () => {
		const release = selected();
		if (!release) return;
		setInstalling(true);
		const result = await attempt(
			() => api.apworld.install(release.tag),
			`Installed version ${versionOf(release)}. Restart the Archipelago launcher if it's open.`,
		);
		setInstalling(false);
		if (result) mutate(result);
	};

	return (
		<>
			<PageHeader
				title="APWorld"
				subtitle={<>Install the {schema.game} world in Archipelago, to generate and host its seeds.</>}
			/>
			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto flex max-w-5xl flex-col gap-5 p-6">
					<Card
						title="Archipelago"
						icon="globe"
						actions={<IconButton icon="refresh" title="Look again" onClick={() => refetch()} />}
					>
						<Show
							when={archipelago()}
							fallback={
								<Show when={status()}>
									<Callout tone="amber">
										Archipelago isn't installed on this computer. Install it from its{" "}
										<a
											class="text-gold hover:underline"
											href="https://github.com/ArchipelagoMW/Archipelago/releases/latest"
											target="_blank"
										>
											latest release
										</a>
										, then look again.
									</Callout>
								</Show>
							}
						>
							{(found) => (
								<p class="text-[13px] text-zinc-300">
									{found().version ? `Archipelago ${found().version}` : "Archipelago"}, in{" "}
									<Code>{found().path}</Code>
								</p>
							)}
						</Show>
					</Card>

					<Card title="World" icon="puzzle">
						<div class="flex flex-col gap-4 text-[13px]">
							<p class="text-zinc-300">
								<Show when={installed()} fallback="Not installed yet.">
									{(world) => (
										<>
											Installed: <Code>{world().file}</Code>
											{world().worldVersion ? `, version ${world().worldVersion}` : ""}
										</>
									)}
								</Show>
							</p>

							<div class="flex items-end gap-3">
								<Field label="Version" class="w-80">
									<Select
										value={tag()}
										disabled={!loaded(releases)?.length}
										onChange={setTag}
										options={(loaded(releases) ?? []).map((r) => ({
											value: r.tag,
											label: `${versionOf(r)}${r.prerelease ? " (pre-release)" : ""}, ${formatDate(r.publishedAt)}`,
										}))}
									/>
								</Field>
								<Button
									variant="primary"
									icon="download"
									busy={installing()}
									disabled={!archipelago() || !selected()}
									onClick={install}
								>
									Install
								</Button>
							</div>
							<p class="-mt-2 text-xs text-zinc-500">
								<Show
									when={selected()}
									fallback={
										releases.error
											? "Couldn't reach GitHub to look up the releases."
											: "Looking up the releases..."
									}
								>
									{(release) => (
										<>
											{release().assetName}, {formatBytes(release().size)}. The player options
											editor makes YAML files for version {schema.worldVersion}.
										</>
									)}
								</Show>
							</p>
							<p class="text-xs text-zinc-500">
								It goes into Archipelago's <Code>custom_worlds</Code> folder, replacing the version
								there.
							</p>
						</div>
					</Card>
				</div>
			</div>
		</>
	);
}
