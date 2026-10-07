import { createSignal, For, Show } from "solid-js";
import type { Check } from "../../tracker/checks";
import { FALLBACK_ICON } from "../../tracker/data";
import type { Requirement } from "../../tracker/logic";
import { checkState, whyBlocked, type CheckState } from "../../tracker/state";
import Icon from "../Icon";

/** The colours of PopTracker: in logic, out of logic, checked, plus one for seeds without rules. */
export const stateColors: Record<CheckState, string> = {
	available: "#22c55e",
	blocked: "#ef4444",
	checked: "#71717a",
	unknown: "#38bdf8",
};

const stateLabels: Record<CheckState, string> = {
	available: "In logic",
	blocked: "Out of logic",
	checked: "Checked",
	unknown: "No logic",
};

const stateOrder: Record<CheckState, number> = { available: 0, unknown: 1, blocked: 2, checked: 3 };

/** The checks of a marker or a group, the ones in logic first; a check out of logic shows why on click. */
export default function CheckList(props: { checks: Check[] }) {
	const sorted = () =>
		[...props.checks].sort(
			(a, b) => stateOrder[checkState(a.id)] - stateOrder[checkState(b.id)] || a.name.localeCompare(b.name),
		);
	return (
		<ul class="flex flex-col">
			<For each={sorted()}>{(check) => <CheckRow check={check} />}</For>
		</ul>
	);
}

function CheckRow(props: { check: Check }) {
	const [open, setOpen] = createSignal(false);
	const state = () => checkState(props.check.id);
	const blocked = () => state() === "blocked";
	return (
		<li class="border-b border-white/5 last:border-b-0">
			<button
				type="button"
				disabled={!blocked()}
				onClick={() => setOpen(!open())}
				class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left enabled:hover:bg-white/5"
				data-tooltip={props.check.name}
			>
				<img
					src={props.check.icon}
					alt=""
					class="size-6 shrink-0 rounded border border-black/60"
					onError={(e) => (e.currentTarget.src = FALLBACK_ICON)}
				/>
				<span class="min-w-0 flex-1">
					<span
						class={`block truncate text-[13px] ${state() === "checked" ? "text-zinc-500" : "text-zinc-100"}`}
					>
						{props.check.name}
					</span>
					<Show when={props.check.note}>
						<span class="block truncate text-[11px] text-zinc-500">{props.check.note}</span>
					</Show>
				</span>
				<span
					class="size-2.5 shrink-0 rounded-full"
					style={{ background: stateColors[state()] }}
					data-tooltip={stateLabels[state()]}
				/>
				<Show when={blocked()}>
					<Icon
						name="chevronRight"
						class={`size-3.5 shrink-0 text-zinc-500 transition-transform ${open() ? "rotate-90" : ""}`}
					/>
				</Show>
			</button>
			<Show when={open() && blocked()}>
				<div class="px-3 pb-2 pl-11">
					<Requirements requirements={whyBlocked(props.check.id)} />
				</div>
			</Show>
		</li>
	);
}

/** A requirement tree: what must all be met, and the groups of which one is enough. */
function Requirements(props: { requirements: Requirement[] }) {
	return (
		<ul class="flex flex-col gap-0.5 text-[12px]">
			<For each={props.requirements}>
				{(requirement) => (
					<li>
						<div class={`flex items-center gap-1.5 ${requirement.met ? "text-zinc-500" : "text-zinc-200"}`}>
							<Icon
								name={requirement.met ? "circleCheck" : "circleX"}
								class={`size-3.5 shrink-0 ${requirement.met ? "text-emerald-500/70" : "text-red-400"}`}
							/>
							<span>
								{requirement.kind === "item"
									? `Requires ${requirement.text}`
									: requirement.kind === "region"
										? `To reach ${requirement.text}:`
										: `${requirement.text}:`}
							</span>
						</div>
						<Show when={requirement.children}>
							{(children) => (
								<div class="mt-0.5 ml-[7px] border-l border-white/10 pl-3">
									<Requirements requirements={children()} />
								</div>
							)}
						</Show>
					</li>
				)}
			</For>
		</ul>
	);
}
