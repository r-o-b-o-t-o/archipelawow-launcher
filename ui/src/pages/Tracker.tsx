import { createResource, createSignal, For, onMount, Show } from "solid-js";
import Icon from "../components/Icon";
import MapView from "../components/tracker/MapView";
import SidePanel from "../components/tracker/SidePanel";
import { Button, Callout, inputBase, Spinner, Switch, TextInput } from "../components/ui";
import { api } from "../lib/api";
import { inLauncher } from "../lib/bridge";
import { errorMessage, toast } from "../lib/toast";
import { loadTrackerData } from "../tracker/data";
import { checks, checkState, initTracker, seed, setData, slotData, status } from "../tracker/state";
import type { MapInfo } from "../tracker/types";

const DEFAULT_PORT = 38281;

// Kept across visits of the page: Azeroth's world map at first
const [mapId, setMapId] = createSignal(0);

export default function Tracker() {
	const [data] = createResource(async () => {
		const loaded = await loadTrackerData();
		setData(loaded);
		return loaded;
	});
	const [settings, { mutate: setSettings }] = createResource(() => (inLauncher ? api.settings.get() : undefined));
	const hideChecked = () => settings()?.tracker.hideChecked ?? true;

	onMount(() => initTracker().catch((error) => toast(errorMessage(error), "error")));

	const visibleChecks = () =>
		hideChecked() ? checks().filter((check) => checkState(check.id) !== "checked") : checks();

	const setHideChecked = async (value: boolean) => {
		try {
			setSettings(await api.settings.update({ trackerHideChecked: value }));
		} catch (error) {
			toast(errorMessage(error), "error");
		}
	};

	const trail = () => {
		const maps = data()?.maps ?? [];
		const result: MapInfo[] = [];
		for (let map = maps.find((m) => m.id === mapId()); map; map = maps.find((m) => m.id === map!.parent))
			result.unshift(map);
		return result;
	};

	return (
		<div class="flex h-full flex-col">
			<ConnectionBar />
			<Show when={status().status === "connected" && slotData() && !slotData()!.logic}>
				<Callout tone="amber" class="mx-4 mt-3">
					This seed was generated before the apworld sent its rules to trackers: its checks show without
					logic.
				</Callout>
			</Show>
			<Show
				when={data()}
				fallback={
					<div class="flex flex-1 items-center justify-center text-zinc-500">
						<Show when={data.error} fallback={<Spinner class="size-6" />}>
							{errorMessage(data.error)}
						</Show>
					</div>
				}
			>
				{(loaded) => (
					<div class="flex min-h-0 flex-1">
						<div class="flex min-w-0 flex-1 flex-col">
							<div class="flex items-center gap-1 border-b border-white/5 px-4 py-2 text-[13px]">
								<For each={trail()}>
									{(map, index) => (
										<>
											<Show when={index() > 0}>
												<Icon name="chevronRight" class="size-3.5 text-zinc-600" />
											</Show>
											<button
												type="button"
												class="rounded px-1.5 py-0.5 hover:bg-white/5"
												classList={{
													"text-zinc-100": map.id === mapId(),
													"text-zinc-400": map.id !== mapId(),
												}}
												onClick={() => setMapId(map.id)}
											>
												{map.name}
											</button>
										</>
									)}
								</For>
								<div class="ml-auto">
									<Switch checked={hideChecked()} onChange={setHideChecked} label="Hide checked" />
								</div>
							</div>
							<div class="min-h-0 flex-1">
								<MapView
									data={loaded()}
									mapId={mapId()}
									onNavigate={setMapId}
									checks={visibleChecks()}
								/>
							</div>
						</div>
						<SidePanel data={loaded()} checks={checks()} hideChecked={hideChecked()} />
					</div>
				)}
			</Show>
		</div>
	);
}

/** The room to track: a form while disconnected, who is tracked once connected. */
function ConnectionBar() {
	const [host, setHost] = createSignal("");
	const [port, setPort] = createSignal(String(DEFAULT_PORT));
	const [slot, setSlot] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [busy, setBusy] = createSignal(false);

	onMount(async () => {
		if (!inLauncher) return;
		const saved = (await api.settings.get()).tracker;
		// Without a room of its own yet, the tracker starts from the one the server's module connects to
		const module = saved.host ? null : await api.archipelago.getConnection().catch(() => null);
		setHost(saved.host ?? module?.host ?? "");
		setPort(String(saved.port ?? module?.port ?? DEFAULT_PORT));
		setSlot(saved.slot ?? "");
		setPassword(saved.password ?? module?.password ?? "");
	});

	const connect = async (event: SubmitEvent) => {
		event.preventDefault();
		setBusy(true);
		try {
			await api.tracker.connect(host(), Number(port()), slot(), password());
		} catch (error) {
			toast(errorMessage(error), "error");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div class="border-b border-white/5 bg-surface-1 px-4 py-2.5">
			<Show
				when={status().status === "connected"}
				fallback={
					<form class="flex flex-wrap items-center gap-2" onSubmit={connect}>
						<span class="mr-1 flex items-center gap-2 text-[13px] font-medium text-zinc-300">
							<Icon name="plug" class="size-4 text-gold" />
							Room
						</span>
						<TextInput
							placeholder="Host, e.g. archipelago.gg"
							value={host()}
							onValue={setHost}
							class="w-56"
						/>
						<input
							class={`${inputBase} h-9 w-24 px-3`}
							type="number"
							min="1"
							max="65535"
							placeholder="Port"
							value={port()}
							onInput={(e) => setPort(e.currentTarget.value)}
						/>
						<TextInput placeholder="Slot name" value={slot()} onValue={setSlot} class="w-44" />
						<TextInput
							type="password"
							placeholder="Password (optional)"
							value={password()}
							onValue={setPassword}
							class="w-44"
						/>
						<Button
							type="submit"
							variant="primary"
							busy={busy() || status().status === "connecting"}
							disabled={!host().trim() || !slot().trim()}
						>
							Connect
						</Button>
						<Show when={status().error}>
							<span class="text-[13px] text-red-300">{status().error}</span>
						</Show>
					</form>
				}
			>
				<div class="flex items-center gap-3 text-[13px]">
					<span class="size-2 rounded-full bg-emerald-400" />
					<span class="text-zinc-300">
						Tracking <span class="font-medium text-zinc-100">{seed()?.playerName}</span> on{" "}
						<span class="text-zinc-100">
							{host()}:{port()}
						</span>
					</span>
					<Button
						size="sm"
						variant="ghost"
						icon="unplug"
						class="ml-auto"
						onClick={() => api.tracker.disconnect().catch((error) => toast(errorMessage(error), "error"))}
					>
						Disconnect
					</Button>
				</div>
			</Show>
		</div>
	);
}
