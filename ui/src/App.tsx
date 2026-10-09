import { A, type RouteSectionProps, useNavigate } from "@solidjs/router";
import { For, type ParentProps, Show, onMount } from "solid-js";

import Icon, { type IconName } from "./components/Icon";
import { serverStates } from "./components/ServerCard";
import { Dot, Spinner } from "./components/ui";
import { api } from "./lib/api";
import { inLauncher } from "./lib/bridge";
import { appInfo, initStore, launcherUpdate, servers, shuttingDown, task } from "./lib/store";
import { dismissToast, errorMessage, toast, toasts } from "./lib/toast";

export default function App(props: RouteSectionProps) {
	const navigate = useNavigate();

	onMount(async () => {
		try {
			await initStore();
			// Installed servers don't run before the setup is done. Without them, the player options may be all
			// that's wanted, and the dashboard points to the setup.
			const status = inLauncher ? await api.setup.getStatus() : null;
			if (status?.serverInstalled && (!status.databaseInitialized || !status.configsCreated))
				navigate("/setup", { replace: true });
		} catch (error) {
			toast(errorMessage(error), "error");
		}
	});

	return (
		<div class="flex h-full">
			<Sidebar />
			<main class="flex min-w-0 flex-1 flex-col overflow-hidden">
				<Show when={!inLauncher}>
					<div class="bg-amber-500/10 px-8 py-2 text-[13px] text-amber-300">
						This page is meant to run inside the launcher: start it with{" "}
						<code>--dev-server http://localhost:5173</code>.
					</div>
				</Show>
				{props.children}
			</main>
			<Toasts />
			<Show when={shuttingDown()}>
				<div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
					<Spinner class="size-8 text-gold" />
					<p class="text-zinc-200">
						{task() ? "Stopping the servers and the task in progress..." : "Stopping the servers..."}
					</p>
				</div>
			</Show>
		</div>
	);
}

function Sidebar() {
	return (
		<nav class="flex w-60 shrink-0 flex-col border-r border-white/5 bg-surface-1">
			<div class="flex items-center gap-3 px-5 py-5">
				<img src="/favicon.svg" alt="" class="size-10" />
				<div>
					<div class="font-semibold tracking-wide text-zinc-50">ArchipelaWoW</div>
					<div class="text-xs text-zinc-500">Launcher</div>
				</div>
			</div>

			<div class="flex flex-col gap-1 px-3">
				<NavLink href="/" icon="dashboard" end>
					Dashboard
				</NavLink>
				<NavLink href="/setup" icon="wand">
					Setup
				</NavLink>
				<NavLink href="/player-options" icon="sword">
					Player options
				</NavLink>
				<NavLink href="/tracker" icon="map">
					Tracker
				</NavLink>
				<NavLink href="/settings" icon="sliders">
					Settings
				</NavLink>
			</div>

			<div class="mt-auto flex flex-col gap-2 border-t border-white/5 px-5 py-4">
				<For each={servers()}>
					{(server) => (
						<div class="flex items-center gap-2 text-[13px]">
							<Dot tone={serverStates[server.state].tone} pulse={serverStates[server.state].pulse} />
							<span class="text-zinc-300">{server.displayName}</span>
							<span class="ml-auto text-xs text-zinc-500">{serverStates[server.state].label}</span>
						</div>
					)}
				</For>
				<Show when={task()}>
					{(current) => (
						<div class="mt-1 flex items-center gap-2 text-xs text-gold">
							<Spinner class="size-3" />
							<span class="truncate">{current().title}</span>
						</div>
					)}
				</Show>
				<div class="mt-2 flex items-center gap-2 text-[11px] text-zinc-600">
					Version {appInfo()?.version}
					<Show when={launcherUpdate()?.version}>
						<A href="/settings" class="text-gold hover:underline">
							Update available
						</A>
					</Show>
				</div>
			</div>
		</nav>
	);
}

function NavLink(props: ParentProps<{ href: string; icon: IconName; end?: boolean }>) {
	return (
		<A
			href={props.href}
			end={props.end}
			class="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
			activeClass="bg-gold/10 text-gold"
			inactiveClass="text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
		>
			<Icon name={props.icon} class="size-4" />
			{props.children}
		</A>
	);
}

function Toasts() {
	const colors = {
		info: "border-sky-500/30 text-sky-200",
		success: "border-emerald-500/30 text-emerald-200",
		error: "border-red-500/40 text-red-200",
	};
	const icons = { info: "info", success: "check", error: "alert" } as const;
	return (
		<div class="pointer-events-none fixed right-6 bottom-6 z-50 flex w-96 flex-col gap-2">
			<For each={toasts()}>
				{(item) => (
					<div
						class={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-2/95 px-4 py-3 text-[13px] shadow-xl backdrop-blur ${colors[item.kind]}`}
						onClick={() => dismissToast(item.id)}
					>
						<Icon name={icons[item.kind]} class="mt-0.5 size-4 shrink-0" />
						<span class="min-w-0 flex-1 select-text">{item.message}</span>
					</div>
				)}
			</For>
		</div>
	);
}
