// The tracker's connection, pushed by the launcher, and what follows from it.
import { createMemo, createRoot, createSignal } from "solid-js";
import { api, type TrackerItem, type TrackerSeed, type TrackerStatus } from "../lib/api";
import { inLauncher, on } from "../lib/bridge";
import { buildChecks, type Check } from "./checks";
import { evaluate, explainLocation, reachableRegions, type Requirement } from "./logic";
import type { SlotData, TrackerData } from "./types";

/** Checked, in logic, doable out of logic, out of logic, or unknown for a seed without rules. */
export type CheckState = "checked" | "available" | "sequenceBreak" | "blocked" | "unknown";

// ProgressiveType.RIDING in the apworld's items/progressive.py
const RIDING_TRACK = 5;

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

	// The level brackets also ask for the class's abilities and the riding ranks, which pace the seed rather
	// than make its checks doable: with them all, the regions a check can be done in out of logic
	const reachableOutOfLogic = createMemo(() => {
		const slot = slotData();
		if (!slot?.logic) return null;
		const names = seed()!.itemNames;
		const paced = new Map(counts());
		for (const [id] of slot.items.spells) paced.set(names[id], 1);
		for (const [id, track, steps] of slot.items.progressive)
			if (track === RIDING_TRACK) paced.set(names[id], steps.length);
		return reachableRegions(slot.logic, paced);
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
		const regionsOutOfLogic = reachableOutOfLogic();
		const results = ruleResults();
		const stateOf = (id: number): CheckState => {
			const entry = locationLogic().get(id);
			if (done.has(id)) return "checked";
			if (!regions || !regionsOutOfLogic || !entry) return "unknown";
			if (!results[entry.rule]) return "blocked";
			if (regions.has(entry.region)) return "available";
			return regionsOutOfLogic.has(entry.region) ? "sequenceBreak" : "blocked";
		};
		return new Map(checks().map((check) => [check.id, stateOf(check.id)]));
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
