import { For, type JSX, Show, createMemo, createSignal } from "solid-js";

import { type Check, type SideGroup, levelIcon } from "../../tracker/checks";
import { FALLBACK_ICON, asset, iconUrl } from "../../tracker/data";
import { explain } from "../../tracker/logic";
import { checkRegion, checkState, counts, items, seed, slotData } from "../../tracker/state";
import type { TrackerData } from "../../tracker/types";
import { ProgressBar } from "../ui";
import CheckList from "./CheckList";
import { markerBackground } from "./MapView";

// The tracks of the progressive items, ProgressiveType in the apworld's items/progressive.py
const PROGRESSIVE_ICONS: Record<number, string> = {
	1: "ability_rogue_sprint",
	2: "spell_holy_borrowedtime",
	3: "inv_misc_food_15",
	4: "inv_drink_07",
	5: "ability_mount_ridinghorse",
};

// GearCategory in the apworld's items/gear.py
const GEAR_ICONS: Record<number, string> = { 1: "inv_sword_04", 2: "inv_chest_chain_05", 3: "inv_jewelry_ring_03" };

/** The bracket of a level, as the apworld's regions.get_region_by_level files it: 01-05 up to level 5. */
const bracketOf = (level: number) => Math.min(15, Math.max(0, Math.ceil(level / 5) - 1));
/** A bracket's name: the seed's region, or worked out the same way for a seed without rules. */
const bracketName = (index: number) =>
	slotData()?.logic?.regions[index] ??
	`Levels ${String(Math.max(1, index * 5)).padStart(2, "0")}-${String((index + 1) * 5).padStart(2, "0")}`;

function Img(props: { src: string; class?: string }) {
	return (
		<img
			src={props.src}
			alt=""
			class={props.class ?? "size-8 rounded border border-black/60"}
			onError={(e) => (e.currentTarget.src = FALLBACK_ICON)}
		/>
	);
}

export default function SidePanel(props: { data: TrackerData; checks: Check[]; hideChecked: boolean }) {
	const [tab, setTab] = createSignal<"checks" | "items">("checks");

	return (
		<aside class="flex w-[340px] shrink-0 flex-col border-l border-white/5 bg-surface-1">
			<Show when={slotData()}>
				<Summary data={props.data} />
			</Show>
			<div class="flex border-b border-white/5 px-3">
				<For each={["checks", "items"] as const}>
					{(name) => (
						<button
							type="button"
							class="border-b-2 px-3 py-2 text-[13px] font-medium capitalize transition-colors"
							classList={{
								"border-gold text-gold": tab() === name,
								"border-transparent text-zinc-400 hover:text-zinc-200": tab() !== name,
							}}
							onClick={() => setTab(name)}
						>
							{name === "checks" ? "Checks" : `Items (${items().filter(Boolean).length})`}
						</button>
					)}
				</For>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<Show when={tab() === "checks"} fallback={<ReceivedItems data={props.data} />}>
					<SideChecks data={props.data} checks={props.checks} hideChecked={props.hideChecked} />
				</Show>
			</div>
		</aside>
	);
}

/** The character, its level, the goal and the progressive items. */
function Summary(props: { data: TrackerData }) {
	const slot = () => slotData()!;
	const race = () => slot().options.character_race;
	const characterClass = () => slot().options.character_class;
	const level = () => (counts().get("Level Up") ?? 0) + 1;

	const goal = createMemo(() => {
		const logic = slot().logic;
		const achievement = props.data.achievements[slot().goal];
		if (!logic) return { achievement, met: 0, total: 0 };
		const requirements = explain(logic.rules[logic.goal], counts()).flatMap((r) => r.children ?? [r]);
		return { achievement, met: requirements.filter((r) => r.met).length, total: requirements.length };
	});

	const progressive = () =>
		slot().items.progressive.map(([id, track, steps]) => {
			const name = seed()?.itemNames[id] ?? `Item ${id}`;
			return {
				name,
				icon: PROGRESSIVE_ICONS[track] ? iconUrl(PROGRESSIVE_ICONS[track]) : FALLBACK_ICON,
				have: counts().get(name) ?? 0,
				total: steps.length,
			};
		});

	return (
		<section class="flex flex-col gap-3 border-b border-white/5 p-4">
			<div class="flex items-center gap-3">
				<Img src={asset(`ui/race_${race()}.webp`)} class="size-10 rounded-full border border-black/60" />
				<Img
					src={asset(`ui/class_${characterClass()}.webp`)}
					class="size-10 rounded-full border border-black/60"
				/>
				<div class="min-w-0">
					<div class="truncate font-semibold text-zinc-100">{seed()?.playerName}</div>
					<div class="truncate text-[13px] text-zinc-400">
						{props.data.characters.races[race()]?.name} {props.data.characters.classes[characterClass()]},
						level <span class="text-zinc-200">{level()}</span>
						<span class="text-zinc-500"> / {slot().maxlevel}</span>
					</div>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<Img src={goal().achievement?.icon ? iconUrl(goal().achievement!.icon!) : FALLBACK_ICON} />
				<div class="min-w-0 flex-1">
					<div class="flex items-baseline gap-2 text-[13px]">
						<span class="truncate text-zinc-200">Goal: {goal().achievement?.name ?? slot().goal}</span>
						<Show when={goal().total > 0}>
							<span class="ml-auto shrink-0 text-xs text-zinc-400">
								{goal().met}/{goal().total} zones
							</span>
						</Show>
					</div>
					<Show when={goal().total > 0}>
						<ProgressBar value={goal().met / goal().total} class="mt-1.5" />
					</Show>
				</div>
			</div>

			<div class="grid grid-cols-5 gap-1.5">
				<For each={progressive()}>
					{(item) => (
						<div class="relative" data-tooltip={`${item.name}: ${item.have}/${item.total}`}>
							<Img
								src={item.icon}
								class={`size-full rounded border border-black/60 ${item.have === 0 ? "opacity-35 grayscale" : ""}`}
							/>
							<span class="absolute right-0.5 bottom-0 text-[11px] font-bold text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">
								{item.have}/{item.total}
							</span>
						</div>
					)}
				</For>
			</div>
		</section>
	);
}

/** A tile of a side panel grid, and the checks it opens. */
interface Tile {
	key: number;
	name: string;
	label: string;
	icon: string;
	checks: Check[];
}

/**
 * The checks with no spot on the maps: class training and level ups by bracket, skills by skill, achievements,
 * unplaced quests.
 */
function SideChecks(props: { data: TrackerData; checks: Check[]; hideChecked: boolean }) {
	const [selected, setSelected] = createSignal<string | null>(null);
	const visible = (checks: Check[]) =>
		props.hideChecked ? checks.filter((c) => checkState(c.id) !== "checked") : checks;
	const group = (name: SideGroup) => props.checks.filter((check) => check.group === name);

	const brackets = (name: SideGroup) => {
		const result = new Map<number, Check[]>();
		for (const check of group(name)) {
			const bracket = checkRegion(check.id) ?? bracketOf(check.level ?? 1);
			result.set(bracket, [...(result.get(bracket) ?? []), check]);
		}
		return [...result.entries()].sort(([a], [b]) => a - b).map(([bracket, checks]) => ({ bracket, checks }));
	};

	const bracketTiles = (name: SideGroup, icon: (bracket: number) => string): Tile[] =>
		brackets(name).map(({ bracket, checks }) => ({
			key: bracket,
			name: bracketName(bracket),
			label: bracketName(bracket).replace("Levels ", ""),
			icon: icon(bracket),
			checks,
		}));

	const skillTiles = (): Tile[] => {
		const result = new Map<number, Check[]>();
		for (const check of group("skills")) result.set(check.skill!, [...(result.get(check.skill!) ?? []), check]);
		return [...result.entries()]
			.map(([skill, checks]) => {
				const name = props.data.skills[skill]?.name ?? `Skill ${skill}`;
				return { key: skill, name, label: name.replace("Two-Handed ", "2H "), icon: checks[0].icon, checks };
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	};

	/** A grid of tiles, and below it the checks of the one selected. */
	const TileGrid = (gridProps: { name: SideGroup; tiles: Tile[] }) => {
		const selectedChecks = () => {
			const key = selected();
			if (!key?.startsWith(`${gridProps.name}:`)) return null;
			const tile = +key.split(":")[1];
			return visible(gridProps.tiles.find((t) => t.key === tile)?.checks ?? []);
		};

		return (
			<>
				<div class="grid grid-cols-4 gap-1.5">
					<For each={gridProps.tiles.filter((t) => visible(t.checks).length > 0)}>
						{(tile) => {
							const key = `${gridProps.name}:${tile.key}`;
							const pending = () => tile.checks.filter((c) => checkState(c.id) !== "checked").length;
							return (
								<button
									type="button"
									class="flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors"
									classList={{
										"border-gold/60 bg-gold/10": selected() === key,
										"border-white/5 bg-surface-2 hover:bg-surface-3": selected() !== key,
									}}
									data-tooltip={tile.name}
									onClick={() => setSelected(selected() === key ? null : key)}
								>
									<span class="relative">
										<Img src={tile.icon} class="size-7 rounded border border-black/60" />
										<span
											class="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-surface-2"
											style={{ background: markerBackground(tile.checks) }}
										/>
									</span>
									<span class="text-center text-[11px] leading-tight text-zinc-400">
										{tile.label}
									</span>
									<span class="mt-auto text-[11px] text-zinc-500">
										{tile.checks.length - pending()}/{tile.checks.length}
									</span>
								</button>
							);
						}}
					</For>
				</div>
				<Show when={selectedChecks()}>
					{(checks) => (
						<div class="mt-2 rounded-lg border border-white/5 bg-surface-2">
							<CheckList checks={checks()} />
						</div>
					)}
				</Show>
			</>
		);
	};

	const Section = (sectionProps: { title: string; count: number; children: JSX.Element }) => (
		<Show when={sectionProps.count > 0}>
			<section class="border-b border-white/5 px-3 py-3">
				<h3 class="mb-2 px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
					{sectionProps.title}
				</h3>
				{sectionProps.children}
			</section>
		</Show>
	);

	return (
		<>
			<Section title="Class training" count={visible(group("spells")).length}>
				<TileGrid
					name="spells"
					tiles={bracketTiles("spells", () => asset(`ui/class_${slotData()?.options.character_class}.webp`))}
				/>
			</Section>
			<Section title="Levels" count={visible(group("levels")).length}>
				<TileGrid name="levels" tiles={bracketTiles("levels", (bracket) => levelIcon((bracket + 1) * 5))} />
			</Section>
			<Section title="Skills" count={visible(group("skills")).length}>
				<TileGrid name="skills" tiles={skillTiles()} />
			</Section>
			<Section title="Achievements" count={visible(group("achievements")).length}>
				<div class="rounded-lg border border-white/5 bg-surface-2">
					<CheckList checks={visible(group("achievements"))} />
				</div>
			</Section>
			<Section title="Quests without a place" count={visible(group("quests")).length}>
				<div class="rounded-lg border border-white/5 bg-surface-2">
					<CheckList checks={visible(group("quests"))} />
				</div>
			</Section>
			<Show when={slotData() && visible(props.checks.filter((c) => c.group)).length === 0}>
				<p class="px-4 py-6 text-center text-[13px] text-zinc-500">Every check off the maps is done.</p>
			</Show>
		</>
	);
}

/** What the slot received, the latest first. */
function ReceivedItems(props: { data: TrackerData }) {
	const icons = createMemo(() => {
		const slot = slotData();
		const result = new Map<number, string>();
		if (!slot) return result;
		for (const [id, , icon] of slot.items.zones) result.set(id, iconUrl(icon));
		for (const [id, spell] of slot.items.spells) {
			const icon = props.data.spells[spell]?.icon;
			if (icon) result.set(id, iconUrl(icon));
		}
		for (const [id, item] of slot.items.items) {
			const icon = props.data.items[item]?.icon;
			if (icon) result.set(id, iconUrl(icon));
		}
		for (const [id, track] of slot.items.progressive)
			result.set(id, PROGRESSIVE_ICONS[track] ? iconUrl(PROGRESSIVE_ICONS[track]) : FALLBACK_ICON);
		for (const [id, category] of slot.items.gear)
			result.set(id, GEAR_ICONS[category] ? iconUrl(GEAR_ICONS[category]) : FALLBACK_ICON);
		result.set(slot.items.levels, levelIcon(10));
		result.set(slot.items.money, iconUrl("inv_misc_coin_01"));
		return result;
	});
	const received = () => [...items()].filter(Boolean).reverse();

	return (
		<Show
			when={received().length > 0}
			fallback={<p class="px-4 py-6 text-center text-[13px] text-zinc-500">No items received yet.</p>}
		>
			<ul class="flex flex-col">
				<For each={received()}>
					{(item) => (
						<li class="flex items-center gap-2.5 border-b border-white/5 px-4 py-1.5">
							<Img
								src={icons().get(item.item) ?? FALLBACK_ICON}
								class="size-7 shrink-0 rounded border border-black/60"
							/>
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13px] text-zinc-100">{item.name}</div>
								<div class="truncate text-[11px] text-zinc-500">
									{item.player === 0
										? "Starting inventory"
										: item.playerName === seed()?.playerName
											? item.locationName
											: `${item.playerName}: ${item.locationName}`}
								</div>
							</div>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
