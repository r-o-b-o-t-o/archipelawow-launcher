// Evaluates the rules a seed carries in its slot data, the way Archipelago does: a location is in logic when
// its region can be reached from the origin through entrances whose rules hold, and its own rule holds.
import type { Logic, Rule } from "./types";

/** How many of each item the slot has received, by name. */
type Counts = ReadonlyMap<string, number>;

const has = (counts: Counts, item: string, count = 1) => (counts.get(item) ?? 0) >= count;

export function evaluate(rule: Rule, counts: Counts): boolean {
	switch (rule.rule) {
		case "True_":
			return true;
		case "False_":
			return false;
		case "Has":
			return has(counts, rule.item_name, rule.count);
		case "HasAll":
			return rule.item_names.every((item) => has(counts, item));
		case "HasAny":
			return rule.item_names.some((item) => has(counts, item));
		case "HasAllCounts":
			return rule.item_counts.every(([item, count]) => has(counts, item, count));
		case "HasAnyCount":
			return rule.item_counts.some(([item, count]) => has(counts, item, count));
		case "And":
			return rule.children.every((child) => evaluate(child, counts));
		case "Or":
			return rule.children.some((child) => evaluate(child, counts));
		default:
			// A rule this tracker doesn't know yet: rather in logic than hiding a check for good
			return true;
	}
}

/** The regions the slot can reach. */
export function reachableRegions(logic: Logic, counts: Counts): Set<number> {
	const reachable = new Set([logic.origin]);
	for (let changed = true; changed;) {
		changed = false;
		for (const [from, to, rule] of logic.entrances) {
			if (reachable.has(from) && !reachable.has(to) && evaluate(logic.rules[rule], counts)) {
				reachable.add(to);
				changed = true;
			}
		}
	}
	return reachable;
}

/**
 * A requirement of a rule, for showing why a check is out of logic: an item, or a group of requirements of
 * which one is enough, that are all needed, or that open a region.
 */
export interface Requirement {
	kind: "item" | "any" | "all" | "region";
	text: string;
	/** The item's name, for an item. */
	item?: string;
	met: boolean;
	children?: Requirement[];
}

/** How an item reads in a requirement: Level Up counts are the character's level, minus the one it starts at. */
function itemRequirement(item: string, count: number): string {
	if (item === "Level Up") return `Level ${count + 1}`;
	return count > 1 ? `${item} ×${count}` : item;
}

/** A rule as the list of requirements that must all be met. */
export function explain(rule: Rule, counts: Counts): Requirement[] {
	const item = (name: string, count = 1): Requirement => ({
		kind: "item",
		text: itemRequirement(name, count),
		item: name,
		met: has(counts, name, count),
	});
	const anyOf = (children: Requirement[][]): Requirement[] => {
		const options = children.map((group): Requirement =>
			group.length === 1
				? group[0]
				: { kind: "all", text: "All of", met: group.every((r) => r.met), children: group },
		);
		return [{ kind: "any", text: "One of", met: options.some((r) => r.met), children: options }];
	};

	switch (rule.rule) {
		case "True_":
			return [];
		case "False_":
			return [{ kind: "item", text: "the impossible", met: false }];
		case "Has":
			return [item(rule.item_name, rule.count)];
		case "HasAll":
			return rule.item_names.map((name) => item(name));
		case "HasAny":
			return anyOf(rule.item_names.map((name) => [item(name)]));
		case "HasAllCounts":
			return rule.item_counts.map(([name, count]) => item(name, count));
		case "HasAnyCount":
			return anyOf(rule.item_counts.map(([name, count]) => [item(name, count)]));
		case "And":
			return rule.children.flatMap((child) => explain(child, counts));
		case "Or":
			return anyOf(rule.children.map((child) => explain(child, counts)));
		default:
			return [
				{
					kind: "item",
					text: `a rule this tracker can't read (${(rule as { rule: string }).rule})`,
					met: true,
				},
			];
	}
}

/**
 * Why a location is out of logic: the regions on the way to its own that can't be reached, each with what
 * opens it, then the location's own requirements.
 */
export function explainLocation(logic: Logic, location: number, counts: Counts, reachable: Set<number>): Requirement[] {
	const entry = logic.locations.find(([id]) => id === location);
	if (!entry) return [];
	const [, region, rule] = entry;

	// The shortest way from the origin, whatever the rules, which is the bracket ladder for this world
	const previous = new Map<number, [number, number]>();
	const queue = [logic.origin];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const [from, to, entrance] of logic.entrances) {
			if (from === current && to !== logic.origin && !previous.has(to)) {
				previous.set(to, [from, entrance]);
				queue.push(to);
			}
		}
	}
	const path: [number, number][] = [];
	for (let current = region; previous.has(current); current = previous.get(current)![0])
		path.unshift([current, previous.get(current)![1]]);

	const regions = path
		.filter(([id]) => !reachable.has(id))
		.map(([id, entrance]): Requirement => ({
			kind: "region",
			text: logic.regions[id],
			met: false,
			children: explain(logic.rules[entrance], counts),
		}));
	return [...regions, ...explain(logic.rules[rule], counts)];
}
