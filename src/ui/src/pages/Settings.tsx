import { createEffect, createResource, createSignal, For, on, Show } from "solid-js";
import ClientDataPanel from "../components/ClientDataPanel";
import { Button, Card, Code, Field, inputBase, PageHeader, Select, Switch, TextInput } from "../components/ui";
import { api, type FolderTarget } from "../lib/api";
import { formatDate } from "../lib/format";
import { appInfo, servers, isActive } from "../lib/store";
import { attempt, toast } from "../lib/toast";
import { guardUnsaved } from "../lib/unsaved";

const folders: { target: FolderTarget; label: string }[] = [
	{ target: "root", label: "Installation" },
	{ target: "configs", label: "Configuration" },
	{ target: "logs", label: "Server logs" },
	{ target: "launcherLogs", label: "Launcher logs" },
	{ target: "data", label: "Client data" },
	{ target: "players", label: "Player options" },
	{ target: "mysql", label: "MySQL" },
];

export default function Settings() {
	return (
		<>
			<PageHeader title="Settings" subtitle="Configure the launcher and the servers." />
			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto flex max-w-5xl flex-col gap-5 p-6">
					<General />
					<Card title="Client data" icon="package">
						<ClientDataPanel />
					</Card>
					<ConfigEditor />
					<Card title="Folders" icon="folder">
						<div class="flex flex-wrap gap-2">
							<For each={folders}>
								{(folder) => (
									<Button
										size="sm"
										icon="folder"
										onClick={() => attempt(() => api.app.openPath(folder.target))}
									>
										{folder.label}
									</Button>
								)}
							</For>
						</div>
					</Card>
					<About />
				</div>
			</div>
		</>
	);
}

function General() {
	const [settings, { mutate }] = createResource(api.settings.get);
	const [port, setPort] = createSignal("");
	createEffect(on(settings, (s) => s && setPort(String(s.mySqlPort))));
	const anyActive = () => servers().some(isActive);

	const update = async (patch: Parameters<typeof api.settings.update>[0], message?: string) => {
		const result = await attempt(() => api.settings.update(patch), message);
		if (result) mutate(result);
	};

	return (
		<Card title="General" icon="sliders">
			<div class="flex flex-col gap-5">
				<Switch
					checked={settings()?.autoStartServers ?? false}
					onChange={(autoStartServers) => update({ autoStartServers })}
					label="Start the servers when the launcher opens"
				/>
				<div class="flex items-end gap-3">
					<Field
						label="MySQL port"
						class="w-48"
						hint={anyActive() ? "Stop the servers to change it." : undefined}
					>
						<TextInput value={port()} onValue={setPort} inputmode="numeric" disabled={anyActive()} />
					</Field>
					<Button
						disabled={anyActive() || port() === String(settings()?.mySqlPort)}
						onClick={() => {
							const mySqlPort = Number(port());
							if (!Number.isInteger(mySqlPort)) toast("Enter the port as a number.", "error");
							else update({ mySqlPort }, "Port changed, the server configuration was updated to match.");
						}}
					>
						Apply
					</Button>
				</div>
				<p class="-mt-2 text-xs text-zinc-500">
					The database only accepts connections from this computer, with the user <Code>acore</Code> and
					password <Code>acore</Code>, e.g. from HeidiSQL or Keira3.
				</p>
			</div>
		</Card>
	);
}

function ConfigEditor() {
	const [files] = createResource(api.config.list);
	const [file, setFile] = createSignal<string | null>(null);
	const [text, setText] = createSignal("");
	const [original, setOriginal] = createSignal("");

	createEffect(
		on(files, (list) => list?.length && !file() && setFile(list.find((f) => f === "worldserver.conf") ?? list[0])),
	);
	createEffect(
		on(file, async (name) => {
			if (!name) return;
			const content = (await attempt(() => api.config.read(name))) ?? "";
			setText(content);
			setOriginal(content);
		}),
	);

	const dirty = () => text() !== original();
	guardUnsaved(dirty);

	const save = async () => {
		const name = file();
		if (!name) return;
		if ((await attempt(() => api.config.write(name, text()))) === undefined) return;
		setOriginal(text());
		toast(`Saved ${name}. Restart the server that uses it, or run "reload config" in the worldserver.`, "success");
	};

	return (
		<Card
			title="Configuration files"
			icon="file"
			actions={
				<Show when={files()?.length}>
					<Select
						class="w-64"
						value={file() ?? ""}
						onChange={(name) => (!dirty() || confirm("Discard the unsaved changes?")) && setFile(name)}
						options={(files() ?? []).map((f) => ({ value: f, label: f }))}
					/>
				</Show>
			}
		>
			<Show
				when={files()?.length}
				fallback={<p class="text-[13px] text-zinc-500">The configuration files are created by the setup.</p>}
			>
				<textarea
					class={`${inputBase} h-96 w-full resize-y px-3 py-2 font-mono text-[12px] leading-relaxed`}
					spellcheck={false}
					value={text()}
					onInput={(e) => setText(e.currentTarget.value)}
				/>
				<div class="mt-3 flex gap-2">
					<Button variant="primary" icon="save" disabled={!dirty()} onClick={save}>
						Save
					</Button>
					<Button disabled={!dirty()} onClick={() => setText(original())}>
						Revert
					</Button>
				</div>
			</Show>
		</Card>
	);
}

function About() {
	const manifest = () => appInfo()?.manifest;
	const commitLink = (repository: string, commit: string) => (
		<a class="font-mono text-gold hover:underline" href={`${repository}/commit/${commit}`} target="_blank">
			{commit.slice(0, 10)}
		</a>
	);

	return (
		<Card title="About" icon="info">
			<dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
				<dt class="text-zinc-500">Version</dt>
				<Show
					when={manifest()}
					fallback={<dd class="text-zinc-200">{appInfo()?.version}, development build</dd>}
				>
					{(m) => (
						<dd class="text-zinc-200">
							{m().version}, built {formatDate(m().builtAt)}{" "}
							<a class="text-gold hover:underline" href={`${m().repository}/releases`} target="_blank">
								releases
							</a>
						</dd>
					)}
				</Show>
				<Show when={manifest()}>
					{(m) => (
						<>
							<dt class="text-zinc-500">AzerothCore</dt>
							<dd>{commitLink(m().azerothcore.repository, m().azerothcore.commit)}</dd>
							<For each={m().modules}>
								{(module) => (
									<>
										<dt class="text-zinc-500">{module.name}</dt>
										<dd>{commitLink(module.repository, module.commit)}</dd>
									</>
								)}
							</For>
							<dt class="text-zinc-500">MySQL</dt>
							<dd class="text-zinc-200">{m().mysql}</dd>
							<dt class="text-zinc-500">Player options</dt>
							<dd class="text-zinc-200">for apworld {m().apworld}</dd>
						</>
					)}
				</Show>
				<dt class="text-zinc-500">Folder</dt>
				<dd class="font-mono text-xs text-zinc-400 select-text">{appInfo()?.root}</dd>
			</dl>
		</Card>
	);
}
