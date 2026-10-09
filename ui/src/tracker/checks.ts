// The seed's checks, with where they are on the maps, put together from the slot data and the extracts.
import { FALLBACK_ICON, asset, iconUrl } from "./data";
import type { MapInfo, Position, SlotData, TrackerData } from "./types";

/** Where the side panel lists a check that has no spot on the maps. */
export type SideGroup = "spells" | "levels" | "skills" | "achievements" | "quests";

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
	/** The level a spell is trained at, or the level reached. */
	level?: number;
	/** The SkillLine.dbc id of a skill check. */
	skill?: number;
	note?: string;
}

const QUEST_ICON = asset("ui/quest.webp");
const FLIGHT_ICON = asset("ui/flightmaster.webp");
/** World Explorer's, for a subzone the extracts don't know. */
const EXPLORATION_ICON = iconUrl("inv_misc_map02");

/** The icon of the level achievement at or above a level: Level 10 for levels 2 to 10. */
export const levelIcon = (level: number) => iconUrl(`achievement_level_${Math.min(80, Math.ceil(level / 10) * 10)}`);

export function buildChecks(data: TrackerData, slot: SlotData, names: Record<string, string>): Check[] {
	const side = data.characters.races[slot.options.character_race]?.side;
	const name = (id: number) => names[id] ?? `Location ${id}`;
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
		});
	}

	const spellLevels = new Map(slot.items.spells.map(([, spell, level]) => [spell, level]));
	for (const [spell, id] of slot.locations.spells) {
		const icon = data.spells[spell]?.icon;
		checks.push({
			id,
			name: name(id),
			icon: icon ? iconUrl(icon) : FALLBACK_ICON,
			group: "spells",
			level: spellLevels.get(spell),
		});
	}

	for (const [level, id] of slot.locations.levels)
		checks.push({ id, name: name(id), icon: levelIcon(level), group: "levels", level });

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
