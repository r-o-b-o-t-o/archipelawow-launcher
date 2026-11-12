// The seed's checks, with where they are on the maps, put together from the slot data and the extracts.
import { FALLBACK_ICON, asset, iconUrl } from "./data";
import type { MapInfo, Position, SlotData, TrackerData } from "./types";

/** Where the side panel lists a check that has no spot on the maps. */
export type SideGroup = "spells" | "levels" | "skills" | "shop" | "achievements" | "quests";

interface Spot {
	/** The map's id. */
	map: number;
	x: number;
	y: number;
}

export interface Check {
	/** The location id, or a prerequisite's quest id negated, which no location has. */
	id: number;
	name: string;
	icon: string;
	spot?: Spot;
	group?: SideGroup;
	/** The level a spell is trained at, the level reached, or the level a shop item goes on sale at. */
	level?: number;
	/**
	 * The level the check can be done from in-game when the seed expects it later: a quest's and the quests before it,
	 * the Dungeon Finder's for a dungeon's achievement or bosses, or 1 for a faction leader, a flight path or a subzone
	 * to explore, which any character holding their zones can reach.
	 */
	doableLevel?: number;
	/** The SkillLine.dbc id of a skill check. */
	skill?: number;
	/** Where the weapon masters or mount trainers that teach a spell to the character stand, with their zones. */
	trainers?: { spot: Spot; zone: number }[];
	/** The zone of the trainer a copy of a spell check stands for on the maps (see mapChecks). */
	trainerZone?: number;
	note?: string;
	/** The class abilities a quest takes, as the items that teach them. */
	abilities?: { name: string; icon: string }[];
	/** For a quest the seed doesn't check that comes before quest checks (see buildPrerequisites): their location ids. */
	prerequisiteOf?: number[];
	/** The zone items a prerequisite's zones take. */
	zoneItems?: string[];
}

const QUEST_ICON = asset("ui/quest.webp");
export const SHOP_ICON = iconUrl("inv_misc_coin_02");
const FLIGHT_ICON = asset("ui/flightmaster.webp");
/** World Explorer's, for a subzone the extracts don't know. */
const EXPLORATION_ICON = iconUrl("inv_misc_map02");

/** The icon of the level achievement at or above a level: Level 10 for levels 2 to 10. */
export const levelIcon = (level: number) => iconUrl(`achievement_level_${Math.min(80, Math.ceil(level / 10) * 10)}`);

const spot = (position: Position): Spot => ({ map: position[0], x: position[1], y: position[2] });

/**
 * Where the character's side picks a quest up: at a giver it can talk to, else any giver, where it's turned in for a
 * quest started by an item, or somewhere in its zone.
 */
function questPlacer(data: TrackerData, side: number | undefined) {
	const mapsById = new Map(data.maps.map((map) => [map.id, map]));
	return (questId: number): { spot?: Spot; note?: string } => {
		const quest = data.quests[questId];
		// A quest given on both sides is shown where the character's side picks it up
		const givers = quest?.givers ?? [];
		const giver = givers.find((g) => g[3] == null || g[3] === side) ?? givers[0];
		if (giver)
			return { spot: spot(giver), note: quest?.atEnder ? "Started by an item, turned in here" : undefined };
		const map = quest?.map != null ? mapsById.get(quest.map) : undefined;
		return map
			? {
					spot: { map: map.id, x: map.center?.[0] ?? 0.5, y: map.center?.[1] ?? 0.5 },
					note: "Somewhere in this zone",
				}
			: {};
	};
}

/** The seed's spell items by spell id, with the level each is trained at, and a class ability as the item teaching it. */
function abilities(data: TrackerData, slot: SlotData, itemNames: Record<string, string>) {
	const spellItems = new Map(slot.items.spells.map(([item, spell, level]) => [spell, { item, level }]));
	const ability = (spell: number) => {
		const item = spellItems.get(spell)?.item;
		const icon = data.spells[spell]?.icon;
		return {
			name: (item != null && itemNames[item]) || `Spell ${spell}`,
			icon: icon ? iconUrl(icon) : FALLBACK_ICON,
		};
	};
	return { spellItems, ability };
}

export function buildChecks(
	data: TrackerData,
	slot: SlotData,
	names: Record<string, string>,
	itemNames: Record<string, string>,
): Check[] {
	const race = slot.options.character_race;
	const side = data.characters.races[race]?.side;
	const name = (id: number) => names[id] ?? `Location ${id}`;
	const { spellItems, ability } = abilities(data, slot, itemNames);
	const placeQuest = questPlacer(data, side);

	// A dungeon's first achievement by id is its normal one, ahead of the heroic ones
	const dungeonIcons = new Map<number, string>();
	for (const achievement of Object.values(data.achievements))
		if (achievement.map != null && achievement.icon && !dungeonIcons.has(achievement.map))
			dungeonIcons.set(achievement.map, iconUrl(achievement.icon));
	const dungeonByEncounter = new Map<number, number>();
	for (const [mapId, dungeon] of Object.entries(data.dungeons))
		for (const encounter of dungeon.encounters) dungeonByEncounter.set(encounter, +mapId);
	const entrance = (mapId: number) => {
		const position = data.dungeons[mapId]?.entrances[0];
		return position ? spot(position) : undefined;
	};
	const dungeonLevel = (mapId: number | undefined) => (mapId != null ? data.dungeons[mapId]?.minLevel : undefined);

	const checks: Check[] = [];

	for (const [questId, id] of slot.locations.quests) {
		const quest = data.quests[questId];
		const { spot: where, note } = placeQuest(questId);
		checks.push({
			id,
			name: name(id),
			icon: QUEST_ICON,
			spot: where,
			group: where ? undefined : "quests",
			doableLevel: quest?.doableLevel,
			abilities: quest?.requiredSpells?.map(ability),
			note,
		});
	}

	for (const [node, id] of slot.locations.flightpaths) {
		const flightPath = data.flightpaths[node];
		checks.push({
			id,
			name: name(id),
			icon: FLIGHT_ICON,
			spot: flightPath && spot(flightPath.position),
			doableLevel: 1,
		});
	}

	for (const [creature, id] of slot.locations.leaders ?? []) {
		const leader = data.leaders[creature];
		checks.push({
			id,
			name: name(id),
			icon: leader?.icon ? iconUrl(leader.icon) : FALLBACK_ICON,
			spot: leader && spot(leader.position),
			group: leader ? undefined : "achievements",
			// The seed expects the capitals from level 5, but any character can walk there from level 1
			doableLevel: 1,
		});
	}

	for (const [achievementId, id] of slot.locations.achievements) {
		const achievement = data.achievements[achievementId];
		const where = achievement?.map != null ? entrance(achievement.map) : undefined;
		checks.push({
			id,
			name: name(id),
			icon: achievement?.icon ? iconUrl(achievement.icon) : FALLBACK_ICON,
			spot: where,
			group: where ? undefined : "achievements",
			doableLevel: dungeonLevel(achievement?.map),
		});
	}

	for (const [encounter, id] of slot.locations.bosses) {
		const mapId = dungeonByEncounter.get(encounter);
		const where = mapId != null ? entrance(mapId) : undefined;
		checks.push({
			id,
			name: name(id),
			icon: (mapId != null && dungeonIcons.get(mapId)) || FALLBACK_ICON,
			spot: where,
			group: where ? undefined : "achievements",
			doableLevel: dungeonLevel(mapId),
		});
	}

	for (const [criteria, id] of slot.locations.explorations ?? []) {
		const exploration = data.explorations[criteria];
		checks.push({
			id,
			name: name(id),
			icon: exploration?.icon ? iconUrl(exploration.icon) : EXPLORATION_ICON,
			spot: exploration && spot(exploration.position),
			group: exploration ? undefined : "achievements",
			doableLevel: 1,
		});
	}

	// Only the trainers of the seed's zones: the apworld counts on no other, such as Dalaran's
	const seedZones = new Set(slot.items.zones.map(([, zone]) => zone));
	for (const [spell, id] of slot.locations.spells) {
		const icon = data.spells[spell]?.icon;
		const trainers = data.spells[spell]?.trainers
			?.filter((trainer) => (!trainer.races || trainer.races & (1 << (race - 1))) && seedZones.has(trainer.zone))
			.map((trainer) => ({ spot: spot(trainer.position), zone: trainer.zone }));
		checks.push({
			id,
			name: name(id),
			icon: icon ? iconUrl(icon) : FALLBACK_ICON,
			group: "spells",
			level: spellItems.get(spell)?.level,
			trainers: trainers?.length ? trainers : undefined,
		});
	}

	for (const [level, id] of slot.locations.levels)
		checks.push({ id, name: name(id), icon: levelIcon(level), group: "levels", level });

	for (const [level, id] of slot.locations.shop ?? [])
		checks.push({ id, name: name(id), icon: SHOP_ICON, group: "shop", level });

	for (const [skill, , id] of slot.locations.skills ?? []) {
		const icon = data.skills[skill]?.icon;
		checks.push({ id, name: name(id), icon: icon ? iconUrl(icon) : FALLBACK_ICON, group: "skills", skill });
	}

	return checks;
}

/**
 * The quests the seed doesn't check that come before its quest checks left to do, placed like those, each with the
 * checks it comes before. Of the quests of which one is enough, the ones the character can take; and none that a
 * checked quest needed, as it's done. A quest check isn't one: it shows as the check it is, and the quests before it
 * as its own.
 */
export function buildPrerequisites(
	data: TrackerData,
	slot: SlotData,
	itemNames: Record<string, string>,
	checks: Check[],
	checked: ReadonlySet<number>,
) {
	const race = slot.options.character_race;
	const characterClass = slot.options.character_class;
	const takes = (questId: number) => {
		const quest = data.quests[questId];
		return (
			quest != null &&
			(quest.races == null || (quest.races & (1 << (race - 1))) !== 0) &&
			(quest.classes == null || (quest.classes & (1 << (characterClass - 1))) !== 0)
		);
	};
	const before = (questId: number) => {
		const quest = data.quests[questId];
		return { all: quest?.requiresAll ?? [], any: (quest?.requiresAny ?? []).filter(takes) };
	};
	const questChecks = new Set(slot.locations.quests.map(([questId]) => questId));

	// The quests surely done before a quest: those that are all needed and, of those of which one is enough, what every
	// alternative the character can take needs
	const needed = new Map<number, Set<number>>();
	const needs = (questId: number, chain = new Set<number>()): Set<number> => {
		const cached = needed.get(questId);
		if (cached) return cached;
		const result = new Set<number>();
		if (chain.has(questId)) return result;
		chain.add(questId);
		const { all, any } = before(questId);
		for (const previous of all) for (const quest of [previous, ...needs(previous, chain)]) result.add(quest);
		const alternatives = any.map((previous) => new Set([previous, ...needs(previous, chain)]));
		for (const quest of alternatives[0] ?? []) if (alternatives.every((set) => set.has(quest))) result.add(quest);
		chain.delete(questId);
		needed.set(questId, result);
		return result;
	};
	const done = new Set(
		slot.locations.quests.flatMap(([questId, id]) => (checked.has(id) ? [...needs(questId)] : [])),
	);

	const leadsTo = new Map<number, number[]>();
	const walk = (questId: number, id: number, seen: Set<number>) => {
		const { all, any } = before(questId);
		for (const previous of [...all, ...any]) {
			if (done.has(previous) || questChecks.has(previous) || seen.has(previous)) continue;
			seen.add(previous);
			const ids = leadsTo.get(previous);
			if (ids) ids.push(id);
			else leadsTo.set(previous, [id]);
			walk(previous, id, seen);
		}
	};
	for (const [questId, id] of slot.locations.quests) if (!checked.has(id)) walk(questId, id, new Set());

	const names = new Map(checks.map((check) => [check.id, check.name]));
	const zoneItems = new Map(slot.items.zones.map(([item, zone]) => [zone, itemNames[item] ?? `Item ${item}`]));
	const { spellItems, ability } = abilities(data, slot, itemNames);
	const placeQuest = questPlacer(data, data.characters.races[race]?.side);
	return [...leadsTo].flatMap(([questId, ids]): Check[] => {
		const { spot: where, note } = placeQuest(questId);
		if (!where) return [];
		const targets = ids.map((id) => names.get(id) ?? `Location ${id}`);
		const leads = `Opens ${targets.slice(0, 2).join(", ")}${targets.length > 2 ? ` and ${targets.length - 2} more` : ""}`;
		const quest = data.quests[questId];
		return [
			{
				id: -questId,
				name: quest?.name ?? `Quest ${questId}`,
				icon: QUEST_ICON,
				spot: where,
				note: note ? `${leads} · ${note}` : leads,
				prerequisiteOf: ids,
				doableLevel: quest?.doableLevel,
				// Only the abilities the seed sends as items: the character holds the others
				abilities: quest?.requiredSpells?.filter((spell) => spellItems.has(spell)).map(ability),
				// The module only locks the zones the seed has items for
				zoneItems: quest?.zones?.flatMap((zone) => zoneItems.get(zone) ?? []),
			},
		];
	});
}

/** The checks to place on the maps: those with a spot, and a copy of a spell's at each of its trainers. */
export function mapChecks(checks: Check[]): Check[] {
	return checks.flatMap((check) =>
		check.spot
			? [check]
			: (check.trainers ?? []).map((trainer) => ({ ...check, spot: trainer.spot, trainerZone: trainer.zone })),
	);
}

/**
 * Where a spot of one map is on another map of the same continent, from 0 to 1, through the world
 * coordinates both cover.
 */
export function projectSpot(maps: ReadonlyMap<number, MapInfo>, spot: Spot, view: MapInfo): [number, number] | null {
	if (spot.map === view.id) return [spot.x, spot.y];
	const from = maps.get(spot.map);
	if (!from?.bounds || !view.bounds || from.continent !== view.continent) return null;
	const [left, right, top, bottom] = from.bounds;
	const worldY = left - spot.x * (left - right);
	const worldX = top - spot.y * (top - bottom);
	const [vLeft, vRight, vTop, vBottom] = view.bounds;
	return [(vLeft - worldY) / (vLeft - vRight), (vTop - worldX) / (vTop - vBottom)];
}
