// The slot data the apworld sends (fill_slot_data in its world.py), and the data the extractor writes to
// public/tracker (archipelawow-data-extractor's TrackerExtractorService). Both shapes are shared with those
// repositories: change them together.

/**
 * A resolved rule of Archipelago's rule builder, as the apworld's logic_export.py serializes it. That file only
 * lets these through (TRACKER_RULES): a new one goes in both.
 */
export type Rule =
	| { rule: "True_" }
	| { rule: "False_" }
	| { rule: "Has"; item_name: string; count: number }
	| { rule: "HasAll"; item_names: string[] }
	| { rule: "HasAny"; item_names: string[] }
	| { rule: "HasAllCounts"; item_counts: [string, number][] }
	| { rule: "HasAnyCount"; item_counts: [string, number][] }
	| { rule: "And"; children: Rule[] }
	| { rule: "Or"; children: Rule[] };

export interface Logic {
	/** Rules referenced by index from the rest. */
	rules: Rule[];
	regions: string[];
	origin: number;
	/** From region, to region, rule. */
	entrances: [number, number, number][];
	/** Location id, region, rule. */
	locations: [number, number, number][];
	goal: number;
}

/** A game id and the location id of its check. */
type LocationPairs = [number, number][];

export interface SlotData {
	options: {
		character_race: number;
		character_class: number;
	};
	locations: {
		achievements: LocationPairs;
		bosses: LocationPairs;
		/** By Achievement_Criteria.dbc id. Missing from seeds generated before the apworld had exploration checks. */
		explorations?: LocationPairs;
		flightpaths: LocationPairs;
		levels: LocationPairs;
		quests: LocationPairs;
		spells: LocationPairs;
	};
	items: {
		/** The Level Up item. */
		levels: number;
		/** Item, WoW item id. */
		items: [number, number][];
		/** Item, category, quality. */
		gear: [number, number, number][];
		/** Item, zone id, icon, then what the server needs. */
		zones: [number, number, string, ...unknown[]][];
		/** The Gold Pouch item. */
		money: number;
		/** Item, track, steps, levels. */
		progressive: [number, number, number[], number[]][];
		/** Item, spell id, required level, taught spells. */
		spells: [number, number, number, number[]][];
	};
	/** The id of the achievement the goal is named after. */
	goal: number;
	maxlevel: number;
	/** Missing from seeds generated before the apworld exported its rules. */
	logic?: Logic;
}

/** A spot on a map: its id, and where from 0 to 1, with the side its quest giver talks to (1 Alliance, 2 Horde). */
export type Position = [number, number, number, number?];

export interface MapInfo {
	id: number;
	name: string;
	kind: "cosmic" | "world" | "continent" | "zone" | "city";
	parent?: number;
	image: string;
	continent?: number;
	/** Left, right, top, bottom, in world coordinates on the continent. */
	bounds?: [number, number, number, number];
	center?: [number, number];
	/** Drawn as the game does: "add" adds its colour onto the map, "blend" draws it over the map. */
	highlight?: { image: string; blend: "add" | "blend"; rect: [number, number, number, number] };
	hit?: [number, number, number, number];
	/** A continent's zones, as the game tells which is under the pointer: their ids row by row, 0 for none. */
	zones?: { rect: [number, number, number, number]; columns: number; cells: number[] };
}

export interface TrackerData {
	maps: MapInfo[];
	quests: Record<string, { givers?: Position[]; atEnder?: boolean; map?: number }>;
	flightpaths: Record<string, { position: Position }>;
	dungeons: Record<string, { entrances: Position[]; encounters: number[] }>;
	/** By Achievement_Criteria.dbc id: the middle of the subzone, and its achievement's icon. */
	explorations: Record<string, { position: Position; icon?: string }>;
	spells: Record<string, { icon: string }>;
	achievements: Record<string, { name: string; icon?: string; map?: number }>;
	items: Record<string, { icon: string }>;
	/** A race's side is 1 for the Alliance, 2 for the Horde, as a quest giver's. */
	characters: { races: Record<string, { name: string; side: number }>; classes: Record<string, string> };
}
