import { For, Match, Show, Switch as SwitchCase, createSignal } from "solid-js";

import {
	type ChoiceOptionDef,
	type OptionDef,
	type OptionValue,
	RANDOM_KEYS,
	type RangeOptionDef,
	type WeightedOptionDef,
	isRange,
	isWeighted,
	pickedKey,
	rangeRandomKey,
	valueKey,
} from "../lib/playerOptions";
import Icon from "./Icon";
import { Select, Switch, TextInput, inputBase } from "./ui";

const titleCase = (name: string) => name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The keys a weighted option always offers: its choices, or for a range the random rolls and named values. */
function knownKeys(option: WeightedOptionDef) {
	if (isRange(option))
		return [...RANDOM_KEYS, rangeRandomKey(option), ...(option.specialValues ?? []).map((s) => s.name)];
	return [...option.choices.map((c) => c.value), "random"];
}

function keyLabel(option: WeightedOptionDef, key: string) {
	if (key === "random") return "Random";
	if (key === "random-low") return "Random, leaning low";
	if (key === "random-high") return "Random, leaning high";
	const range = /^random-range-(\d+)-(\d+)$/.exec(key);
	if (range) return `Random between ${range[1]} and ${range[2]}`;
	if (!isRange(option)) return option.choices.find((c) => c.value === key)?.label ?? key;
	const special = option.specialValues?.find((s) => s.name === key);
	return special ? `${titleCase(special.name)} (${special.value})` : key;
}

/** Whether the simple controls can show this single value; otherwise the weights editor is used. */
function isSimpleKey(option: WeightedOptionDef, key: string | null) {
	if (key === null) return false;
	if (option.type === "toggle") return key === "true" || key === "false";
	if (isRange(option)) return /^-?\d+$/.test(key) || !!option.specialValues?.some((s) => s.name === key);
	return true;
}

export default function OptionField(props: {
	option: OptionDef;
	value: OptionValue;
	onChange: (value: OptionValue) => void;
}) {
	const [forceWeights, setForceWeights] = createSignal(false);
	const [expanded, setExpanded] = createSignal(false);

	const weights = () => (props.value.kind === "weights" ? props.value.weights : {});
	const picked = () => pickedKey(props.value);
	const option = () => props.option as WeightedOptionDef;
	const showWeights = () => isWeighted(props.option) && (forceWeights() || !isSimpleKey(option(), picked()));
	const pick = (key: string) => props.onChange({ kind: "weights", weights: { [key]: 50 } });

	const toggleWeights = () => {
		if (showWeights()) {
			// Back to a single value: keep the most likely one
			const [top] = Object.entries(weights()).sort((a, b) => b[1] - a[1]);
			const key = top && isSimpleKey(option(), top[0]) ? top[0] : valueKey(option(), option().default);
			pick(key);
			setForceWeights(false);
		} else {
			setForceWeights(true);
		}
	};

	const description = () => props.option.description.trim();
	const firstLine = () => description().split("\n")[0];
	const hasMore = () => description().includes("\n");

	return (
		<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 border-b border-white/5 py-4 last:border-b-0">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					<span class="font-medium text-zinc-100">{props.option.displayName}</span>
					<span class="font-mono text-[11px] text-zinc-600">{props.option.key}</span>
				</div>
				<Show when={description()}>
					<p class="mt-1 text-[13px] whitespace-pre-line text-zinc-400">
						{expanded() ? description() : firstLine()}
					</p>
					<Show when={hasMore()}>
						<button
							type="button"
							class="mt-1 text-xs text-gold/80 hover:text-gold"
							onClick={() => setExpanded(!expanded())}
						>
							{expanded() ? "Show less" : "Show more"}
						</button>
					</Show>
				</Show>
			</div>

			<div class="flex min-w-0 items-start gap-2">
				<div class="min-w-0 flex-1">
					<SwitchCase>
						<Match when={showWeights()}>
							<WeightsEditor
								option={option()}
								weights={weights()}
								onChange={(w) => props.onChange({ kind: "weights", weights: w })}
							/>
						</Match>
						<Match when={props.option.type === "toggle"}>
							<div class="flex h-9 items-center">
								<Switch
									checked={picked() === "true"}
									onChange={(checked) => pick(checked ? "true" : "false")}
									label={picked() === "true" ? "Yes" : "No"}
								/>
							</div>
						</Match>
						<Match when={props.option.type === "choice" || props.option.type === "textChoice"}>
							<Select
								value={picked() ?? ""}
								onChange={pick}
								options={[
									...(option() as ChoiceOptionDef).choices.map((c) => ({
										value: c.value,
										label: c.label,
									})),
									{ value: "random", label: "Random" },
								]}
							/>
						</Match>
						<Match when={isRange(props.option)}>
							<RangeInput option={props.option as RangeOptionDef} value={picked()!} onChange={pick} />
						</Match>
						<Match when={props.value.kind === "text"}>
							<TextInput
								value={props.value.kind === "text" ? props.value.text : ""}
								onValue={(text) => props.onChange({ kind: "text", text })}
							/>
						</Match>
						<Match when={props.value.kind === "yaml"}>
							<textarea
								class={`${inputBase} min-h-9 w-full resize-y px-3 py-2 font-mono text-[12px]`}
								rows={Math.min(
									8,
									(props.value.kind === "yaml" ? props.value.yaml : "").split("\n").length + 1,
								)}
								spellcheck={false}
								value={props.value.kind === "yaml" ? props.value.yaml : ""}
								onInput={(e) => props.onChange({ kind: "yaml", yaml: e.currentTarget.value })}
							/>
							<p class="mt-1 text-xs text-zinc-500">
								YAML, e.g. a list of item names on separate lines starting with "- ".
							</p>
						</Match>
					</SwitchCase>
				</div>
				<Show when={isWeighted(props.option) && props.option.supportsWeighting}>
					<button
						type="button"
						data-tooltip={
							showWeights()
								? "Pick a single value"
								: "Weights: let Archipelago roll between several values"
						}
						onClick={toggleWeights}
						class={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
							showWeights()
								? "border-gold/50 bg-gold/10 text-gold"
								: "border-white/10 text-zinc-500 hover:text-zinc-200"
						}`}
					>
						<Icon name="scale" />
					</button>
				</Show>
			</div>
		</div>
	);
}

function RangeInput(props: { option: RangeOptionDef; value: string; onChange: (key: string) => void }) {
	const number = () => {
		const special = props.option.specialValues?.find((s) => s.name === props.value);
		return special?.value ?? Number(props.value);
	};
	const set = (value: number) => {
		if (Number.isNaN(value)) return;
		props.onChange(
			valueKey(props.option, Math.min(props.option.max, Math.max(props.option.min, Math.round(value)))),
		);
	};

	return (
		<div>
			<div class="flex items-center gap-3">
				<input
					type="range"
					class="min-w-0 flex-1"
					min={props.option.min}
					max={props.option.max}
					value={number()}
					onInput={(e) => set(e.currentTarget.valueAsNumber)}
				/>
				<input
					type="number"
					class={`${inputBase} h-9 w-20 px-3 tabular-nums`}
					min={props.option.min}
					max={props.option.max}
					value={number()}
					onChange={(e) => set(e.currentTarget.valueAsNumber)}
				/>
			</div>
			<Show when={props.option.specialValues?.length}>
				<div class="mt-2 flex flex-wrap gap-1.5">
					<For each={props.option.specialValues}>
						{(special) => (
							<button
								type="button"
								onClick={() => props.onChange(special.name)}
								class={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
									number() === special.value
										? "border-gold/50 bg-gold/10 text-gold"
										: "border-white/10 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								{titleCase(special.name)} <span class="opacity-60">{special.value}</span>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

function WeightsEditor(props: {
	option: WeightedOptionDef;
	weights: Record<string, number>;
	onChange: (weights: Record<string, number>) => void;
}) {
	const [custom, setCustom] = createSignal("");
	const keys = () => {
		const known = knownKeys(props.option);
		return [...known, ...Object.keys(props.weights).filter((key) => !known.includes(key))];
	};
	const total = () => Object.values(props.weights).reduce((sum, weight) => sum + Math.max(0, weight), 0);

	const setWeight = (key: string, weight: number) => {
		const next = { ...props.weights };
		if (weight > 0) next[key] = weight;
		else delete next[key];
		props.onChange(next);
	};

	const addCustom = () => {
		const value = Number(custom());
		if (!isRange(props.option) || !Number.isInteger(value) || value < props.option.min || value > props.option.max)
			return;
		setWeight(valueKey(props.option, value), 50);
		setCustom("");
	};

	return (
		<div class="rounded-lg border border-white/10 bg-surface-1 p-2">
			<For each={keys()}>
				{(key) => {
					const weight = () => props.weights[key] ?? 0;
					return (
						<div class="flex items-center gap-3 rounded px-2 py-1 hover:bg-white/[0.03]">
							<span
								class={`min-w-0 flex-1 truncate text-[13px] ${weight() > 0 ? "text-zinc-100" : "text-zinc-500"}`}
							>
								{keyLabel(props.option, key)}
							</span>
							<span class="w-10 text-right text-xs text-zinc-500 tabular-nums">
								{total() > 0 && weight() > 0 ? `${Math.round((weight() / total()) * 100)}%` : ""}
							</span>
							<input
								type="number"
								min={0}
								class={`${inputBase} h-7 w-20 px-2 text-[13px] tabular-nums`}
								value={weight()}
								onChange={(e) =>
									setWeight(key, Math.max(0, Math.round(e.currentTarget.valueAsNumber || 0)))
								}
							/>
						</div>
					);
				}}
			</For>
			<Show when={isRange(props.option)}>
				<div class="mt-1 flex items-center gap-2 border-t border-white/5 px-2 pt-2">
					<input
						type="number"
						class={`${inputBase} h-7 min-w-0 flex-1 px-2 text-[13px]`}
						placeholder={`A value from ${(props.option as RangeOptionDef).min} to ${(props.option as RangeOptionDef).max}`}
						value={custom()}
						onInput={(e) => setCustom(e.currentTarget.value)}
						onKeyDown={(e) => e.key === "Enter" && addCustom()}
					/>
					<button type="button" class="text-xs text-gold/80 hover:text-gold" onClick={addCustom}>
						Add
					</button>
				</div>
			</Show>
		</div>
	);
}
