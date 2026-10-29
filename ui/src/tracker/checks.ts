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
	/** The location id. */
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
	note?: string;
	/** The class abilities a quest takes, as the items that teach them. */
	abilities?: { name: string; icon: string }[];
}

const QUEST_ICON = asset("ui/quest.webp");
export const SHOP_ICON = iconUrl("inv_misc_coin_02");
const FLIGHT_ICON = asset("ui/flightmaster.webp");
/** World Explorer's, for a subzone the extracts don't know. */
const EXPLORATION_ICON = iconUrl("inv_misc_map02");

/** The icon of the level achievement at or above a level: Level 10 for levels 2 to 10. */
export const levelIcon = (level: number) => iconUrl(`achievement_level_${Math.min(80, Math.ceil(level / 10) * 10)}`);

export function buildChecks(
	data: TrackerData,
	slot: SlotData,
	names: Record<string, string>,
	itemNames: Record<string, string>,
): Check[] {
	const side = data.characters.races[slot.options.character_race]?.side;
	const name = (id: number) => names[id] ?? `Location ${id}`;
	const spellItems = new Map(slot.items.spells.map(([item, spell, level]) => [spell, { item, level }]));
	const ability = (spell: number) => {
		const item = spellItems.get(spell)?.item;
		const icon = data.spells[spell]?.icon;
		return {
			name: (item != null && itemNames[item]) || `Spell ${spell}`,
			icon: icon ? iconUrl(icon) : FALLBACK_ICON,
		};
	};
	const spot = (position: Position): Spot => ({ map: position[0], x: position[1], y: position[2] });
	const mapsById = new Map(data.maps.map((map) => [map.id, map]));
	const center = (mapId: number): Spot | undefined => {
		const map = mapsById.get(mapId);
		return map ? { map: mapId, x: map.center?.[0] ?? 0.5, y: map.center?.[1] ?? 0.5 } : undefined;
	};

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
		// A quest given on both sides is shown where the character's side picks it up
		const givers = quest?.givers ?? [];
		const giver = givers.find((g) => g[3] == null || g[3] === side) ?? givers[0];
		const where = giver ? spot(giver) : quest?.map != null ? center(quest.map) : undefined;
		checks.push({
			id,
			name: name(id),
			icon: QUEST_ICON,
			spot: where,
			group: where ? undefined : "quests",
			doableLevel: quest?.doableLevel,
			abilities: quest?.requiredSpells?.map(ability),
			note:
				giver && quest?.atEnder
					? "Started by an item, turned in here"
					: !giver && where
						? "Somewhere in this zone"
						: undefined,
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

	for (const [spell, id] of slot.locations.spells) {
		const icon = data.spells[spell]?.icon;
		checks.push({
			id,
			name: name(id),
			icon: icon ? iconUrl(icon) : FALLBACK_ICON,
			group: "spells",
			level: spellItems.get(spell)?.level,
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
