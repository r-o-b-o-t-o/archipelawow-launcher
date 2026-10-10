import { For, type JSX, Show } from "solid-js";

import type { HintStatus, TrackerHint } from "../../lib/api";
import type { Check } from "../../tracker/checks";
import { FALLBACK_ICON } from "../../tracker/data";
import { type CheckHints, checkState, hints, seed } from "../../tracker/state";
import Icon from "../Icon";
import { stateColors, stateLabels } from "./checkStates";

/** Archipelago's colours for an item's classification, by its flags. */
export function itemColor(flags: number) {
	if (flags & 1) return "#af99ef";
	if (flags & 2) return "#6d8be8";
	if (flags & 4) return "#fa8072";
	return "#00eeee";
}

const statusLabels: Record<HintStatus, string> = {
	unspecified: "",
	noPriority: "No priority",
	avoid: "Avoid",
	priority: "Priority",
	found: "Found",
};

const statusClasses: Record<HintStatus, string> = {
	unspecified: "",
	noPriority: "text-zinc-400",
	avoid: "text-red-300",
	priority: "text-gold",
	found: "text-emerald-400",
};

const statusOrder: Record<HintStatus, number> = { priority: 0, unspecified: 1, noPriority: 2, avoid: 3, found: 4 };

const byStatus = (a: TrackerHint, b: TrackerHint) => statusOrder[a.status] - statusOrder[b.status];

const world = (hint: TrackerHint) =>
	hint.findingPlayer === seed()?.slot ? "your world" : `${hint.findingPlayerName}'s world`;

/** Where an item of the slot's is. */
export const itemHintText = (hint: TrackerHint) =>
	`${hint.itemName} is at ${hint.locationName} in ${world(hint)}${hint.entrance ? ` (${hint.entrance})` : ""}`;

/** What a location of the slot's world holds. */
export const locationHintText = (hint: TrackerHint) =>
	`${hint.locationName} holds ${hint.receivingPlayer === seed()?.slot ? "your" : `${hint.receivingPlayerName}'s`} ${hint.itemName}`;

const MAX_LINES = 8;

/** A light bulb telling the hints of checks on hover. */
export function HintBadge(props: { hints: CheckHints[]; class?: string }) {
	const text = () => {
		const lines = [
			...props.hints.flatMap((h) => (h.location ? [locationHintText(h.location)] : [])),
			...new Set(props.hints.flatMap((h) => h.items.map(itemHintText))),
		];
		return lines.length > MAX_LINES
			? [...lines.slice(0, MAX_LINES), `And ${lines.length - MAX_LINES} more`].join("\n")
			: lines.join("\n");
	};
	return (
		<Show when={props.hints.length > 0}>
			<span class={props.class ?? "flex shrink-0 text-gold"} data-tooltip={text()}>
				<Icon name="lightbulb" class="size-3.5" />
			</span>
		</Show>
	);
}

function HintRow(props: { icon: string; title: JSX.Element; detail: JSX.Element; hint: TrackerHint; check?: Check }) {
	const found = () => props.hint.status === "found";
	return (
		<li class="flex items-center gap-2.5 border-b border-white/5 px-4 py-1.5" classList={{ "opacity-50": found() }}>
			<img
				src={props.icon}
				alt=""
				class="size-7 shrink-0 rounded border border-black/60"
				onError={(e) => (e.currentTarget.src = FALLBACK_ICON)}
			/>
			<div class="min-w-0 flex-1">
				<div class="truncate text-[13px]">{props.title}</div>
				<div class="truncate text-[11px] text-zinc-500">{props.detail}</div>
			</div>
			<Show when={statusLabels[props.hint.status]}>
				<span class={`shrink-0 text-[11px] ${statusClasses[props.hint.status]}`}>
					{statusLabels[props.hint.status]}
				</span>
			</Show>
			<Show when={props.check && !found()}>
				<span
					class="size-2.5 shrink-0 rounded-full"
					style={{ background: stateColors[checkState(props.check!.id)] }}
					data-tooltip={stateLabels[checkState(props.check!.id)]}
				/>
			</Show>
		</li>
	);
}

function HintList(props: { hints: TrackerHint[]; empty: string; children: (hint: TrackerHint) => JSX.Element }) {
	return (
		<Show
			when={props.hints.length > 0}
			fallback={<p class="px-4 py-6 text-center text-[13px] text-zinc-500">{props.empty}</p>}
		>
			<ul class="flex flex-col">
				<For each={props.hints}>{props.children}</For>
			</ul>
		</Show>
	);
}

/** The hints for the slot's items, from any world. */
export const itemHintsFor = (hideFound: boolean) =>
	hints()
		.filter((h) => h.receivingPlayer === seed()?.slot && !(hideFound && h.status === "found"))
		.sort((a, b) => byStatus(a, b) || a.itemName.localeCompare(b.itemName));

/** The hints for the locations of the slot's world, for any player. */
export const locationHintsFor = (hideFound: boolean) =>
	hints()
		.filter((h) => h.findingPlayer === seed()?.slot && !(hideFound && h.status === "found"))
		.sort((a, b) => byStatus(a, b) || a.locationName.localeCompare(b.locationName, undefined, { numeric: true }));

export function ItemHints(props: {
	hideFound: boolean;
	icons: ReadonlyMap<number, string>;
	checks: ReadonlyMap<number, Check>;
}) {
	return (
		<HintList hints={itemHintsFor(props.hideFound)} empty="No hints for your items yet.">
			{(hint) => (
				<HintRow
					hint={hint}
					icon={props.icons.get(hint.item) ?? FALLBACK_ICON}
					title={<span style={{ color: itemColor(hint.flags) }}>{hint.itemName}</span>}
					detail={
						<>
							{hint.findingPlayer === seed()?.slot ? "" : `${hint.findingPlayerName}: `}
							{hint.locationName}
							{hint.entrance ? ` (${hint.entrance})` : ""}
						</>
					}
					check={hint.findingPlayer === seed()?.slot ? props.checks.get(hint.location) : undefined}
				/>
			)}
		</HintList>
	);
}

export function LocationHints(props: { hideFound: boolean; checks: ReadonlyMap<number, Check> }) {
	return (
		<HintList hints={locationHintsFor(props.hideFound)} empty="No hints for your world's locations yet.">
			{(hint) => (
				<HintRow
					hint={hint}
					icon={props.checks.get(hint.location)?.icon ?? FALLBACK_ICON}
					title={<span class="text-zinc-100">{hint.locationName}</span>}
					detail={
						<>
							<span style={{ color: itemColor(hint.flags) }}>{hint.itemName}</span>
							{hint.receivingPlayer === seed()?.slot ? "" : ` for ${hint.receivingPlayerName}`}
						</>
					}
					check={props.checks.get(hint.location)}
				/>
			)}
		</HintList>
	);
}
