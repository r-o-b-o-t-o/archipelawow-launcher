// The tracker's connection, pushed by the launcher, and what follows from it.
import { createMemo, createRoot, createSignal } from "solid-js";
import { api, type TrackerItem, type TrackerSeed, type TrackerStatus } from "../lib/api";
import { inLauncher, on } from "../lib/bridge";
import { buildChecks, type Check } from "./checks";
import { evaluate, explainLocation, reachableRegions, type Requirement } from "./logic";
import type { SlotData, TrackerData } from "./types";

/** Checked, in logic, out of logic, or unknown for a seed without rules. */
export type CheckState = "checked" | "available" | "blocked" | "unknown";

const [status, setStatus] = createSignal<TrackerStatus>({ status: "disconnected", error: null });
const [seed, setSeed] = createSignal<TrackerSeed | null>(null);
const [items, setItems] = createSignal<TrackerItem[]>([]);
const [checked, setChecked] = createSignal<ReadonlySet<number>>(new Set());
const [data, setData] = createSignal<TrackerData | null>(null);

export { items, seed, setData, status };

let initialized: Promise<void> | undefined;

/** Starts following the launcher's connection, once. */
export function initTracker() {
	if (!inLauncher) return Promise.resolve();
	initialized ??= (async () => {
		on<TrackerStatus>("tracker.status", (value) => {
			setStatus(value);
			// The launcher forgets the seed with its connection, and sends the next one once connected
			if (value.status !== "connected") applySeed(null);
		});
		on<TrackerSeed>("tracker.seed", applySeed);
		on<TrackerItem[]>("tracker.items", (received) =>
			setItems((current) => {
				const next = [...current];
				for (const item of received) next[item.index] = item;
				return next;
			}),
		);
		on<number[]>("tracker.checked", (ids) => setChecked((current) => new Set([...current, ...ids])));
		const [currentStatus, currentSeed] = await Promise.all([api.tracker.getStatus(), api.tracker.getSeed()]);
		setStatus(currentStatus);
		applySeed(currentSeed);
	})();
	return initialized;
}

function applySeed(value: TrackerSeed | null) {
	setSeed(value);
	setItems(value?.items ?? []);
	setChecked(new Set(value?.checked ?? []));
}

const derived = createRoot(() => {
	const slotData = createMemo(() =>
		status().status === "connected" ? (seed()?.slotData as SlotData | undefined) : undefined,
	);

	/** How many of each item the slot holds, by name. */
	const counts = createMemo(() => {
		const result = new Map<string, number>();
		for (const item of items()) if (item) result.set(item.name, (result.get(item.name) ?? 0) + 1);
		return result;
	});

	const reachable = createMemo(() => {
		const logic = slotData()?.logic;
		return logic ? reachableRegions(logic, counts()) : null;
	});

	// Most quests share their rule with others, so each rule is evaluated once
	const ruleResults = createMemo(() => slotData()?.logic?.rules.map((rule) => evaluate(rule, counts())) ?? []);

	/** Each location's region and rule. */
	const locationLogic = createMemo(
		() => new Map(slotData()?.logic?.locations.map(([id, region, rule]) => [id, { region, rule }])),
	);

	const checks = createMemo<Check[]>(() => {
		const current = slotData();
		const tracker = data();
		return current && tracker ? buildChecks(tracker, current, seed()!.locations) : [];
	});

	const states = createMemo(() => {
		const done = checked();
		const regions = reachable();
		const results = ruleResults();
		const result = new Map<number, CheckState>();
		for (const check of checks()) {
			const entry = locationLogic().get(check.id);
			result.set(
				check.id,
				done.has(check.id)
					? "checked"
					: !regions || !entry
						? "unknown"
						: regions.has(entry.region) && results[entry.rule]
							? "available"
							: "blocked",
			);
		}
		return result;
	});

	return { slotData, counts, reachable, locationLogic, checks, states };
});

export const { slotData, counts, checks } = derived;

export const checkState = (id: number): CheckState => derived.states().get(id) ?? "unknown";

/** The region a check sits in, for the side panel's level brackets. */
export const checkRegion = (id: number) => derived.locationLogic().get(id)?.region;

/** Why a check is out of logic. */
export function whyBlocked(id: number): Requirement[] {
	const logic = derived.slotData()?.logic;
	const reachable = derived.reachable();
	return logic && reachable ? explainLocation(logic, id, derived.counts(), reachable) : [];
}
