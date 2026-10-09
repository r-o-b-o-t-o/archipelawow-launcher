import { useNavigate } from "@solidjs/router";
import { type ParentProps, Show, createResource, createSignal } from "solid-js";

import ClientDataPanel from "../components/ClientDataPanel";
import Icon from "../components/Icon";
import PathLengthWarning from "../components/PathLengthWarning";
import ServerPanel from "../components/ServerPanel";
import TaskPanel from "../components/TaskPanel";
import Terminal from "../components/Terminal";
import { Button, Card, Code, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { serverRevision, task } from "../lib/store";
import { attempt, toast } from "../lib/toast";

export default function Setup() {
	const navigate = useNavigate();
	const [status, { refetch }] = createResource(serverRevision, api.setup.getStatus);
	const [busy, setBusy] = createSignal<"database" | "configs" | "start" | null>(null);

	const installed = () => status()?.serverInstalled ?? false;
	const ready = () =>
		installed() && status()?.databaseInitialized && status()?.configsCreated && status()?.clientData.ready;

	const createConfigs = async (overwrite: boolean) => {
		if (
			overwrite &&
			!confirm("Replace every configuration file with a fresh copy? Changes you made to them will be lost.")
		)
			return;
		setBusy("configs");
		const files = await attempt(() => api.setup.createConfigs(overwrite));
		setBusy(null);
		if (files) toast(`Wrote ${files.length} configuration files.`, "success");
		await refetch();
	};

	const setUpDatabase = async () => {
		setBusy("database");
		const result = await attempt(api.setup.initDatabase, "The database is ready.");
		setBusy(null);
		await refetch();
		if (result && !result.configsCreated) await createConfigs(false);
	};

	const start = async () => {
		setBusy("start");
		navigate("/");
		await attempt(api.servers.startAll);
		setBusy(null);
	};

	return (
		<>
			<PageHeader title="Setup" subtitle="Get the server ready to play, and keep it up to date.">
				<Show when={ready()}>
					<Button variant="primary" icon="play" busy={busy() === "start"} onClick={start}>
						Start the servers
					</Button>
				</Show>
			</PageHeader>

			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
					<PathLengthWarning status={status()} />

					<Step number={1} title="Server" done={installed()}>
						<p class="mb-4 text-[13px] text-zinc-400">
							Only needed to host the game: the player options editor works without it.
						</p>
						<ServerPanel status={status()} />
					</Step>

					<Step number={2} title="Database" done={status()?.databaseInitialized}>
						<p class="text-[13px] text-zinc-400">
							Creates the MySQL data files and the <Code>acore</Code> user the servers log in with. They
							create their databases the first time they start. MySQL is only reachable from this
							computer.
						</p>
						<Show when={!status()?.databaseInitialized}>
							<Button
								variant="primary"
								icon="database"
								class="mt-4"
								busy={busy() === "database"}
								disabled={!installed() || task() !== null}
								onClick={setUpDatabase}
							>
								Set up the database
							</Button>
						</Show>
					</Step>

					<Step number={3} title="Configuration" done={status()?.configsCreated}>
						<p class="text-[13px] text-zinc-400">
							Creates the server configuration files from their defaults, with the paths and settings the
							launcher needs. You can edit them later from the settings.
						</p>
						<Show
							when={status()?.configsCreated}
							fallback={
								<Button
									variant="primary"
									icon="file"
									class="mt-4"
									busy={busy() === "configs"}
									disabled={!installed()}
									onClick={() => createConfigs(false)}
								>
									Create the configuration
								</Button>
							}
						>
							<Button
								size="sm"
								icon="refresh"
								class="mt-4"
								busy={busy() === "configs"}
								onClick={() => createConfigs(true)}
							>
								Reset to defaults
							</Button>
						</Show>
					</Step>

					<Step number={4} title="Client data" done={status()?.clientData.ready}>
						<p class="mb-4 text-[13px] text-zinc-400">
							The maps and game data the worldserver reads, taken from the World of Warcraft 3.3.5a
							client. Download them, or extract them from your own client.
						</p>
						<ClientDataPanel serverInstalled={installed()} onChange={() => refetch()} />
					</Step>

					<TaskPanel />
					<Card
						title="Output"
						icon="terminal"
						class="h-80 overflow-hidden"
						bodyClass="flex min-h-0 flex-1 flex-col"
					>
						<Terminal name="tasks" class="flex-1" />
					</Card>
				</div>
			</div>
		</>
	);
}

function Step(props: ParentProps<{ number: number; title: string; done?: boolean }>) {
	return (
		<section class="flex gap-4 rounded-xl border border-white/5 bg-surface-2 p-5">
			<div
				class={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
					props.done ? "bg-emerald-500/15 text-emerald-300" : "bg-gold/15 text-gold"
				}`}
			>
				<Show when={props.done} fallback={props.number}>
					<Icon name="check" class="size-4" />
				</Show>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="mb-1.5 flex items-center gap-2 font-semibold text-zinc-100">
					{props.title}
					<Show when={props.done}>
						<span class="text-xs font-normal text-emerald-400">Done</span>
					</Show>
				</h2>
				{props.children}
			</div>
		</section>
	);
}
