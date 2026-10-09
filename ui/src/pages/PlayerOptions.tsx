import { For, Show, createMemo, createResource, createSignal } from "solid-js";

import Icon from "../components/Icon";
import OptionField from "../components/OptionField";
import { Button, Callout, Code, Field, IconButton, Modal, PageHeader, Select, TextInput } from "../components/ui";
import { api } from "../lib/api";
import {
	NAME_MAX_LENGTH,
	type OptionValue,
	type PlayerDoc,
	applyPreset,
	defaultDoc,
	parsePlayerYaml,
	randomizedDoc,
	schema,
	toPlayerYaml,
	validate,
} from "../lib/playerOptions";
import { attempt, errorMessage, toast } from "../lib/toast";
import { guardUnsaved } from "../lib/unsaved";

const fileNameFor = (slotName: string) => `${slotName.replace(/[<>:"/\\|?*{}]/g, "").trim() || "Player"}.yaml`;

export default function PlayerOptions() {
	const [files, { refetch: refetchFiles }] = createResource(api.players.list);
	const [doc, setDoc] = createSignal<PlayerDoc>(defaultDoc());
	const [fileName, setFileName] = createSignal<string | null>(null);
	const [dirty, setDirty] = createSignal(false);
	const [previewing, setPreviewing] = createSignal(false);
	const [collapsed, setCollapsed] = createSignal(
		new Set(schema.groups.filter((g) => g.collapsed).map((g) => g.name)),
	);

	const problems = createMemo(() => validate(doc()));
	const yaml = createMemo(() => toPlayerYaml(doc()));
	const presets = Object.keys(schema.presets);

	const edit = (change: (current: PlayerDoc) => PlayerDoc) => {
		setDoc(change(doc()));
		setDirty(true);
	};
	const setValue = (key: string, value: OptionValue) =>
		edit((d) => ({ ...d, values: { ...d.values, [key]: value } }));
	const confirmDiscard = () => !dirty() || confirm("Discard the unsaved changes?");
	guardUnsaved(dirty);

	const open = async (name: string) => {
		if (name === fileName() || !confirmDiscard()) return;
		try {
			setDoc(parsePlayerYaml(await api.players.read(name)));
			setFileName(name);
			setDirty(false);
		} catch (error) {
			toast(`Couldn't open ${name}: ${errorMessage(error)}`, "error");
		}
	};

	const startNew = () => {
		if (!confirmDiscard()) return;
		setDoc(defaultDoc());
		setFileName(null);
		setDirty(false);
	};

	const save = async (name = fileName()) => {
		if (problems().length > 0) {
			toast("Fix the problems listed at the top first.", "error");
			return false;
		}
		const target = name ?? fileNameFor(doc().name);
		const taken = files()?.some((f) => f.name.toLowerCase() === target.toLowerCase());
		if (target !== fileName() && taken && !confirm(`${target} already exists. Replace it?`)) return false;
		if ((await attempt(() => api.players.write(target, yaml()))) === undefined) return false;
		setFileName(target);
		setDirty(false);
		refetchFiles();
		toast(`Saved ${target}.`, "success");
		return true;
	};

	const saveAs = async () => {
		const name = prompt("File name", fileName() ?? fileNameFor(doc().name));
		if (!name) return;
		await save(/\.ya?ml$/i.test(name) ? name : `${name}.yaml`);
	};

	const remove = async (name: string) => {
		if (!confirm(`Delete ${name}?`)) return;
		if ((await attempt(() => api.players.delete(name))) === undefined) return;
		if (name === fileName()) {
			setDoc(defaultDoc());
			setFileName(null);
			setDirty(false);
		}
		refetchFiles();
	};

	const importFiles = async () => {
		const imported = await attempt(api.players.import);
		if (!imported?.length) return;
		await refetchFiles();
		await open(imported[0]);
	};

	const exportFile = async () => {
		if ((dirty() || !fileName()) && !(await save())) return;
		if (await attempt(() => api.players.export(fileName()!))) toast("Exported.", "success");
	};

	const toggleGroup = (name: string) => {
		const next = new Set(collapsed());
		if (next.has(name)) next.delete(name);
		else next.add(name);
		setCollapsed(next);
	};

	return (
		<>
			<PageHeader
				title="Player options"
				subtitle={
					<>
						Create the YAML files Archipelago generates {schema.game} seeds from (world version{" "}
						{schema.worldVersion}).
					</>
				}
			>
				<Show when={presets.length > 0}>
					<Select
						class="w-44"
						value=""
						onChange={(preset) => preset && edit((d) => applyPreset(d, schema.presets[preset]))}
						options={[
							{ value: "", label: "Apply a preset..." },
							...presets.map((p) => ({ value: p, label: p })),
						]}
					/>
				</Show>
				<Button icon="dice" title="Pick random values for the game options" onClick={() => edit(randomizedDoc)}>
					Randomize
				</Button>
				<Button
					icon="refresh"
					title="Put every option back to its default"
					onClick={() => edit((d) => ({ ...defaultDoc(), name: d.name, description: d.description }))}
				>
					Defaults
				</Button>
				<Button icon="eye" onClick={() => setPreviewing(true)}>
					Preview
				</Button>
				<Button icon="upload" onClick={exportFile}>
					Export
				</Button>
				<Button variant="primary" icon="save" onClick={() => save()}>
					Save
				</Button>
			</PageHeader>

			<div class="flex min-h-0 flex-1 overflow-hidden">
				<aside class="flex w-64 shrink-0 flex-col border-r border-white/5 bg-surface-1/50">
					<div class="flex items-center gap-1 px-3 py-3">
						<span class="px-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Files</span>
						<div class="ml-auto flex">
							<IconButton icon="plus" title="New" onClick={startNew} />
							<IconButton icon="download" title="Import YAML files" onClick={importFiles} />
							<IconButton
								icon="folder"
								title="Open the players folder"
								onClick={() => attempt(() => api.app.openPath("players"))}
							/>
						</div>
					</div>
					<div class="flex-1 overflow-y-auto px-2 pb-2">
						<Show
							when={files()?.length}
							fallback={<p class="px-2 py-1 text-xs text-zinc-500">No saved files yet.</p>}
						>
							<For each={files()}>
								{(file) => (
									<div
										onClick={() => open(file.name)}
										class={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
											file.name === fileName()
												? "bg-gold/10 text-gold"
												: "text-zinc-300 hover:bg-white/5"
										}`}
									>
										<Icon name="file" class="size-4 shrink-0 opacity-70" />
										<span class="min-w-0 flex-1 truncate">{file.name}</span>
										<button
											type="button"
											aria-label="Delete"
											data-tooltip="Delete"
											class="hidden text-zinc-500 group-hover:block hover:text-red-400"
											onClick={(e) => {
												e.stopPropagation();
												remove(file.name);
											}}
										>
											<Icon name="trash" class="size-3.5" />
										</button>
									</div>
								)}
							</For>
						</Show>
					</div>
				</aside>

				<div class="min-w-0 flex-1 overflow-y-auto">
					<div class="mx-auto flex max-w-5xl flex-col gap-5 p-6">
						<div class="flex items-center gap-2 text-[13px] text-zinc-400">
							<Icon name="file" class="size-4" />
							<span class="font-medium text-zinc-200">{fileName() ?? "New file"}</span>
							<Show when={dirty()}>
								<span class="text-amber-400">(unsaved changes)</span>
							</Show>
							<Show when={fileName()}>
								<button
									type="button"
									class="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
									onClick={saveAs}
								>
									Save as...
								</button>
							</Show>
						</div>

						<Show when={problems().length > 0}>
							<Callout tone="red">
								<ul class="list-disc pl-4">
									<For each={problems()}>{(problem) => <li>{problem}</li>}</For>
								</ul>
							</Callout>
						</Show>

						<section class="rounded-xl border border-white/5 bg-surface-2 p-5">
							<div class="grid grid-cols-2 gap-4">
								<Field
									label="Slot name"
									hint={
										<>
											Your name in the multiworld, up to {NAME_MAX_LENGTH} characters. In game:{" "}
											<Code>.ap connect {doc().name || "Name"}</Code>
										</>
									}
								>
									<TextInput
										value={doc().name}
										maxLength={NAME_MAX_LENGTH}
										onValue={(name) => edit((d) => ({ ...d, name }))}
									/>
								</Field>
								<Field label="Description" hint="Only for you, to tell your files apart.">
									<TextInput
										value={doc().description}
										onValue={(description) => edit((d) => ({ ...d, description }))}
									/>
								</Field>
							</div>
						</section>

						<For each={schema.groups}>
							{(group) => (
								<section class="rounded-xl border border-white/5 bg-surface-2">
									<button
										type="button"
										class="flex w-full items-center gap-2 px-5 py-3 text-left"
										onClick={() => toggleGroup(group.name)}
									>
										<h2 class="font-semibold text-zinc-100">{group.name}</h2>
										<span class="text-xs text-zinc-500">{group.options.length}</span>
										<Icon
											name="chevronDown"
											class={`ml-auto size-4 text-zinc-500 transition-transform ${collapsed().has(group.name) ? "-rotate-90" : ""}`}
										/>
									</button>
									<Show when={!collapsed().has(group.name)}>
										<div class="border-t border-white/5 px-5">
											<For each={group.options}>
												{(option) => (
													<OptionField
														option={option}
														value={doc().values[option.key]}
														onChange={(value) => setValue(option.key, value)}
													/>
												)}
											</For>
										</div>
									</Show>
								</section>
							)}
						</For>
					</div>
				</div>
			</div>

			<Show when={previewing()}>
				<Modal
					title={fileName() ?? fileNameFor(doc().name)}
					wide
					onClose={() => setPreviewing(false)}
					footer={
						<Button
							icon="copy"
							onClick={() =>
								navigator.clipboard.writeText(yaml()).then(() => toast("Copied.", "success"))
							}
						>
							Copy
						</Button>
					}
				>
					<pre class="font-mono text-[12px] leading-relaxed whitespace-pre text-zinc-300">{yaml()}</pre>
				</Modal>
			</Show>
		</>
	);
}
