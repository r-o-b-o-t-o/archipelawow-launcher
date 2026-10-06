import { createSignal, Match, Show, Switch } from "solid-js";
import { api, type ServerState, type ServerStatus } from "../lib/api";
import { now } from "../lib/clock";
import { formatDuration } from "../lib/format";
import { isActive } from "../lib/store";
import { attempt } from "../lib/toast";
import Icon, { type IconName } from "./Icon";
import { Badge, Button, type Tone } from "./ui";

export const serverStates: Record<ServerState, { label: string; tone: Tone; pulse?: boolean }> = {
	stopped: { label: "Stopped", tone: "zinc" },
	starting: { label: "Starting", tone: "amber", pulse: true },
	running: { label: "Running", tone: "green" },
	stopping: { label: "Stopping", tone: "amber", pulse: true },
	crashed: { label: "Crashed", tone: "red" },
};

export default function ServerCard(props: {
	status: ServerStatus;
	description: string;
	icon: IconName;
	selected: boolean;
	onSelect: () => void;
}) {
	const [busy, setBusy] = createSignal<"start" | "stop" | "restart" | null>(null);
	const state = () => serverStates[props.status.state];

	const run = async (action: "start" | "stop" | "restart") => {
		setBusy(action);
		await attempt(() => api.servers[action](props.status.name));
		setBusy(null);
	};

	return (
		<div
			onClick={() => props.onSelect()}
			class={`cursor-pointer rounded-xl border p-4 transition-colors ${
				props.selected ? "border-gold/40 bg-surface-2" : "border-white/5 bg-surface-2/60 hover:border-white/10"
			}`}
		>
			<div class="flex items-start gap-3" title={props.description}>
				<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-gold">
					<Icon name={props.icon} class="size-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="truncate font-semibold text-zinc-100">{props.status.displayName}</div>
					<div class="mt-1">
						<Badge tone={state().tone} pulse={state().pulse}>
							{state().label}
						</Badge>
					</div>
				</div>
			</div>

			<div class="mt-3 h-4 truncate text-xs text-zinc-500 tabular-nums">
				<Switch fallback={props.description}>
					<Match when={props.status.state === "running" && props.status.startedAt}>
						{(startedAt) =>
							`Up ${formatDuration(now() - Date.parse(startedAt()))} · PID ${props.status.pid}`
						}
					</Match>
					<Match when={props.status.state === "starting"}>Starting up...</Match>
					<Match when={props.status.state === "crashed"}>Exited with code {props.status.exitCode}</Match>
				</Switch>
			</div>

			<div class="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
				<Show
					when={isActive(props.status)}
					fallback={
						<>
							<Button
								size="sm"
								variant="primary"
								icon="play"
								busy={busy() === "start"}
								onClick={() => run("start")}
							>
								Start
							</Button>
							{/* A start can wait minutes for the other server: stopping cancels it */}
							<Show when={busy() === "start"}>
								<Button
									size="sm"
									icon="stop"
									onClick={() => attempt(() => api.servers.stop(props.status.name))}
								>
									Stop
								</Button>
							</Show>
						</>
					}
				>
					<Button
						size="sm"
						icon="stop"
						busy={busy() === "stop"}
						disabled={props.status.state === "stopping"}
						onClick={() => run("stop")}
					>
						Stop
					</Button>
					<Button
						size="sm"
						icon="restart"
						title="Restart"
						busy={busy() === "restart"}
						disabled={props.status.state === "stopping"}
						onClick={() => run("restart")}
					/>
					<Show when={props.status.state !== "running"}>
						<Button
							size="sm"
							variant="danger"
							icon="x"
							title="Kill: end the process right away, without letting it shut down cleanly"
							onClick={() => attempt(() => api.servers.kill(props.status.name))}
						/>
					</Show>
				</Show>
			</div>
		</div>
	);
}
