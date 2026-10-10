// The tracker's connection, pushed by the launcher, and what follows from it.
import { createMemo, createRoot, createSignal } from "solid-js";

import { type TrackerHint, type TrackerItem, type TrackerSeed, type TrackerStatus, api } from "../lib/api";
import { inLauncher, on } from "../lib/bridge";
import { type Check, buildChecks } from "./checks";
import { type Requirement, evaluate, explain, explainLocation, reachableRegions } from "./logic";
import type { SlotData, TrackerData } from "./types";

/** Checked, in logic, doable out of logic, out of logic, or unknown for a seed without rules. */
export type CheckState = "checked" | "available" | "sequenceBreak" | "blocked" | "unknown";

// ProgressiveType.RIDING in the apworld's items/progressive.py
const RIDING_TRACK = 5;

const [status, setStatus] = createSignal<TrackerStatus>({ status: "disconnected", error: null });
const [seed, setSeed] = createSignal<TrackerSeed | null>(null);
const [items, setItems] = createSignal<TrackerItem[]>([]);
const [checked, setChecked] = createSignal<ReadonlySet<number>>(new Set());
const [hints, setHints] = createSignal<TrackerHint[]>([]);
const [data, setData] = createSignal<TrackerData | null>(null);

export { hints, items, seed, setData, status };

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
		on<TrackerHint[]>("tracker.hints", (next) => setHints((current) => keepUnchanged(current, next)));
		const [currentStatus, currentSeed] = await Promise.all([api.tracker.getStatus(), api.tracker.getSeed()]);
		setStatus(currentStatus);
		applySeed(currentSeed);
	})();
	return initialized;
}

/**
 * The room's hints, keeping the ones that didn't change as they were: it sends them all on each change, and the
 * lists only redraw the rows of new objects.
 */
function keepUnchanged(current: TrackerHint[], next: TrackerHint[]) {
	const key = (hint: TrackerHint) => `${hint.findingPlayer}:${hint.location}`;
	const previous = new Map(current.map((hint) => [key(hint), hint]));
	return next.map((hint) => {
		const kept = previous.get(key(hint));
		const same = kept && (Object.keys(hint) as (keyof TrackerHint)[]).every((field) => kept[field] === hint[field]);
		return same ? kept : hint;
	});
}

function applySeed(value: TrackerSeed | null) {
	setSeed(value);
	setItems(value?.items ?? []);
	setChecked(new Set(value?.checked ?? []));
	setHints(value?.hints ?? []);
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

	/** The hints not found yet for the slot's items, by name. */
	const itemHints = createMemo(() => {
		const result = new Map<string, TrackerHint[]>();
		for (const hint of hints())
			if (hint.receivingPlayer === seed()?.slot && hint.status !== "found")
				result.set(hint.itemName, [...(result.get(hint.itemName) ?? []), hint]);
		return result;
	});

	/**
	 * The hints of a check: the item its location holds, and where the items its own rule waits on are. Not those
	 * of the regions on the way, which most checks wait on alike: nearly every check would show them.
	 */
	const checkHints = createMemo(() => {
		const result = new Map<number, CheckHints>();
		const own = new Map<number, TrackerHint>();
		for (const hint of hints())
			if (hint.findingPlayer === seed()?.slot && hint.status !== "found") own.set(hint.location, hint);
		const wanted = itemHints();
		const logic = slotData()?.logic;
		const results = ruleResults();
		const byRule = new Map<number, TrackerHint[]>();
		for (const check of checks()) {
			const location = own.get(check.id);
			let items: TrackerHint[] = [];
			const entry = locationLogic().get(check.id);
			if (wanted.size > 0 && logic && entry && !checked().has(check.id) && !results[entry.rule]) {
				if (!byRule.has(entry.rule)) {
					const names = new Set(unmetItems(explain(logic.rules[entry.rule], counts())));
					byRule.set(
						entry.rule,
						[...names].flatMap((name) => wanted.get(name) ?? []),
					);
				}
				items = byRule.get(entry.rule)!;
			}
			if (location || items.length > 0) result.set(check.id, { location, items });
		}
		return result;
	});

	return { slotData, counts, reachable, locationLogic, checks, states, itemHints, checkHints };
});

export interface CheckHints {
	/** What the check's location holds. */
	location?: TrackerHint;
	/** Where the items its rule waits on are. */
	items: TrackerHint[];
}

/** The items of the requirements that aren't met. */
function unmetItems(requirements: Requirement[]): string[] {
	return requirements.flatMap((requirement) =>
		requirement.met ? [] : requirement.item ? [requirement.item] : unmetItems(requirement.children ?? []),
	);
}

export const { slotData, counts, checks, itemHints } = derived;

export const checkHints = (id: number) => derived.checkHints().get(id);

export const checkState = (id: number): CheckState => derived.states().get(id) ?? "unknown";

/** The region a check sits in, for the side panel's level brackets. */
export const checkRegion = (id: number) => derived.locationLogic().get(id)?.region;

/** Why a check is out of logic. */
export function whyBlocked(id: number): Requirement[] {
	const logic = derived.slotData()?.logic;
	const reachable = derived.reachable();
	return logic && reachable ? explainLocation(logic, id, derived.counts(), reachable) : [];
}
