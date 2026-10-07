// The maps, positions and icons the extractor writes to public/tracker.
import type { TrackerData } from "./types";

const base = `${import.meta.env.BASE_URL}tracker/`;

/** The URL of a file of public/tracker. */
export const asset = (path: string) => base + path;

/** An icon by its name in the game files, such as "Icons/Achievement_Zone_ElwynnForest" or "spell_fire_flamebolt". */
export const iconUrl = (name: string) => asset(`icons/${name.split("/").pop()!.trim().toLowerCase()}.webp`);

export const FALLBACK_ICON = iconUrl("inv_misc_questionmark");

let loading: Promise<TrackerData> | undefined;

export function loadTrackerData(): Promise<TrackerData> {
	const files = [
		"maps",
		"quests",
		"flightpaths",
		"dungeons",
		"explorations",
		"spells",
		"achievements",
		"items",
		"characters",
	] as const;
	loading ??= Promise.all(
		files.map(async (file) => {
			const response = await fetch(asset(`${file}.json`));
			if (!response.ok) throw new Error(`Could not load the tracker's ${file}: ${response.status}`);
			return response.json();
		}),
	)
		.then((parts) => Object.fromEntries(files.map((file, i) => [file, parts[i]])) as unknown as TrackerData)
		.catch((error) => {
			loading = undefined;
			throw error;
		});
	return loading;
}
