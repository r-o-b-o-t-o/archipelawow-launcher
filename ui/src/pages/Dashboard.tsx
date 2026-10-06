import { A } from "@solidjs/router";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import Icon, { type IconName } from "../components/Icon";
import PathLengthWarning from "../components/PathLengthWarning";
import ServerCard, { serverStates } from "../components/ServerCard";
import TaskPanel from "../components/TaskPanel";
import Terminal, { clearTerminal } from "../components/Terminal";
import { Button, Callout, Card, Code, Dot, Field, IconButton, PageHeader, Select, TextInput } from "../components/ui";
import { api, type ServerName, type TerminalName } from "../lib/api";
import { isActive, server, servers, task } from "../lib/store";
import { attempt, toast } from "../lib/toast";

const cards: { name: ServerName; description: string; icon: IconName }[] = [
	{ name: "mysql", description: "Database server", icon: "database" },
	{ name: "authserver", description: "Logins and realm list", icon: "globe" },
	{ name: "worldserver", description: "The game world", icon: "sword" },
];

const terminals: { name: TerminalName; label: string }[] = [
	{ name: "mysql", label: "MySQL" },
	{ name: "authserver", label: "Authserver" },
	{ name: "worldserver", label: "Worldserver" },
	{ name: "tasks", label: "Tasks" },
];

export default function Dashboard() {
	const [tab, setTab] = createSignal<TerminalName>("worldserver");
	const [setup] = createResource(api.setup.getStatus);
	const [busy, setBusy] = createSignal<"start" | "stop" | null>(null);

	const allRunning = () => servers().length > 0 && servers().every((s) => s.state === "running");
	const anyActive = () => servers().some(isActive);

	const runAll = async (action: "start" | "stop") => {
		setBusy(action);
		await attempt(action === "start" ? api.servers.startAll : api.servers.stopAll);
		setBusy(null);
	};

	return (
		<>
			<PageHeader title="Dashboard" subtitle="Run the realm and keep an eye on it.">
				<Button
					variant="primary"
					icon="play"
					busy={busy() === "start"}
					disabled={allRunning() || busy() !== null}
					onClick={() => runAll("start")}
				>
					Start all
				</Button>
				<Button
					icon="stop"
					busy={busy() === "stop"}
					disabled={!anyActive() || busy() !== null}
					onClick={() => runAll("stop")}
				>
					Stop all
				</Button>
			</PageHeader>

			<div class="flex min-h-0 flex-1 gap-5 overflow-hidden p-6">
				<div class="flex min-w-0 flex-1 flex-col gap-5">
					<PathLengthWarning status={setup()} />
					<Show when={setup() && (!setup()!.databaseInitialized || !setup()!.configsCreated)}>
						<Callout tone="amber">
							The server isn't set up yet.{" "}
							<A href="/setup" class="font-semibold underline">
								Go to the setup
							</A>
						</Callout>
					</Show>
					<Show when={setup()?.databaseInitialized && setup()?.configsCreated && !setup()?.clientData.ready}>
						<Callout tone="amber">
							The client data (maps, dbc...) is missing: the worldserver won't start without it.{" "}
							<A href="/setup" class="font-semibold underline">
								Install it
							</A>
						</Callout>
					</Show>
					<Show when={task()}>
						<TaskPanel />
					</Show>

					<div class="grid grid-cols-3 gap-4">
						<For each={cards}>
							{(card) => (
								<Show when={server(card.name)}>
									{(status) => (
										<ServerCard
											status={status()}
											description={card.description}
											icon={card.icon}
											selected={tab() === card.name}
											onSelect={() => setTab(card.name)}
										/>
									)}
								</Show>
							)}
						</For>
					</div>

					<Card
						class="min-h-0 flex-1 overflow-hidden"
						bodyClass="flex min-h-0 flex-1 flex-col"
						title={
							<div class="flex gap-1">
								<For each={terminals}>
									{(terminal) => (
										<button
											type="button"
											onClick={() => setTab(terminal.name)}
											class={`flex items-center gap-2 rounded-md px-3 py-1 text-[13px] transition-colors ${
												tab() === terminal.name
													? "bg-surface-4 text-zinc-50"
													: "text-zinc-400 hover:text-zinc-200"
											}`}
										>
											<Show
												when={terminal.name !== "tasks"}
												fallback={<Icon name="terminal" class="size-3.5" />}
											>
												<Dot
													tone={
														serverStates[
															server(terminal.name as ServerName)?.state ?? "stopped"
														].tone
													}
													pulse={
														serverStates[
															server(terminal.name as ServerName)?.state ?? "stopped"
														].pulse
													}
												/>
											</Show>
											{terminal.label}
										</button>
									)}
								</For>
							</div>
						}
						actions={
							<>
								<IconButton
									icon="eraser"
									title="Clear"
									onClick={() => attempt(() => clearTerminal(tab()))}
								/>
								<IconButton
									icon="folder"
									title="Open the log folder"
									onClick={() =>
										attempt(() =>
											api.app.openPath(
												tab() === "mysql" || tab() === "tasks" ? "launcherLogs" : "logs",
											),
										)
									}
								/>
							</>
						}
					>
						<For each={terminals}>
							{(terminal) => (
								<Terminal name={terminal.name} class={tab() === terminal.name ? "flex-1" : "hidden"} />
							)}
						</For>
						<Show when={tab() === "worldserver"}>
							<div class="border-t border-white/5 px-4 py-2 text-xs text-zinc-500">
								Click the terminal and type console commands, e.g. <Code>server info</Code> or{" "}
								<Code>account create name password</Code>.
							</div>
						</Show>
					</Card>
				</div>

				<aside class="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto">
					<ArchipelagoRoom />
					<CreateAccount onCreated={() => setTab("worldserver")} />
					<ConnectClient />
				</aside>
			</div>
		</>
	);
}

function ArchipelagoRoom() {
	const [host, setHost] = createSignal("");
	const [port, setPort] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	onMount(async () => {
		const connection = await api.archipelago.getConnection().catch(() => null);
		setHost(connection?.host ?? "");
		setPort(connection?.port ? String(connection.port) : "");
		setPassword(connection?.password ?? "");
	});

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		const result = await attempt(() => api.archipelago.setConnection(host(), Number(port()), password()));
		setSaving(false);
		if (result)
			toast(
				result.reloaded
					? "Saved, and reloaded by the worldserver."
					: "Saved. It applies when the worldserver starts.",
				"success",
			);
	};

	return (
		<Card title="Archipelago room" icon="globe">
			<form class="flex flex-col gap-3" onSubmit={save}>
				<Field label="Server">
					<TextInput value={host()} onValue={setHost} placeholder="archipelago.gg" />
				</Field>
				<div class="grid grid-cols-2 gap-3">
					<Field label="Port">
						<TextInput value={port()} onValue={setPort} inputmode="numeric" placeholder="38281" />
					</Field>
					<Field label="Password">
						<TextInput value={password()} onValue={setPassword} type="password" placeholder="None" />
					</Field>
				</div>
				<Button type="submit" variant="primary" icon="save" busy={saving()} class="self-start">
					Save
				</Button>
				<p class="text-xs text-zinc-500">
					Characters join the room in game with <Code>.ap connect SlotName</Code>, using the slot name of
					their player options.
				</p>
			</form>
		</Card>
	);
}

function CreateAccount(props: { onCreated: () => void }) {
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [gmLevel, setGmLevel] = createSignal(0);
	const [creating, setCreating] = createSignal(false);
	const running = () => server("worldserver")?.state === "running";

	const create = async (event: SubmitEvent) => {
		event.preventDefault();
		setCreating(true);
		const created = await attempt(() => api.accounts.create(username(), password(), gmLevel()));
		setCreating(false);
		if (created === undefined) return;
		toast(`Created the account ${username()}.`, "success");
		setPassword("");
		props.onCreated();
	};

	return (
		<Card title="Game account" icon="userPlus">
			<form class="flex flex-col gap-3" onSubmit={create}>
				<Field label="Account name">
					<TextInput value={username()} onValue={setUsername} maxLength={20} disabled={!running()} />
				</Field>
				<Field label="Password">
					<TextInput
						value={password()}
						onValue={setPassword}
						type="password"
						maxLength={16}
						disabled={!running()}
					/>
				</Field>
				<Field label="Access">
					<Select
						value={gmLevel()}
						onChange={setGmLevel}
						disabled={!running()}
						options={[
							{ value: 0, label: "Player" },
							{ value: 1, label: "Moderator" },
							{ value: 2, label: "Game master" },
							{ value: 3, label: "Administrator" },
						]}
					/>
				</Field>
				<Button
					type="submit"
					variant="primary"
					icon="userPlus"
					busy={creating()}
					disabled={!running() || !username() || !password()}
					class="self-start"
				>
					Create account
				</Button>
				<Show when={!running()}>
					<p class="text-xs text-zinc-500">Start the worldserver to create accounts.</p>
				</Show>
			</form>
		</Card>
	);
}

function ConnectClient() {
	const realmlist = "set realmlist 127.0.0.1";
	return (
		<Card title="Play" icon="sword">
			<p class="text-[13px] text-zinc-400">
				Point your World of Warcraft 3.3.5a client at this server: in its <Code>Data\enUS</Code> (or your
				locale) folder, make <Code>realmlist.wtf</Code> read:
			</p>
			<div class="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-surface-1 py-1 pr-1 pl-3">
				<code class="flex-1 font-mono text-[13px] text-zinc-200">{realmlist}</code>
				<IconButton
					icon="copy"
					title="Copy"
					onClick={() => navigator.clipboard.writeText(realmlist).then(() => toast("Copied.", "success"))}
				/>
			</div>
		</Card>
	);
}
