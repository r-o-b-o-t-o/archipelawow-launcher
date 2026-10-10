// Archipelago player options for World of Warcraft: the schema generated from the apworld by
// scripts/dump-options-schema.py, and conversion between the editor's state and YAML files.
import YAML from "yaml";

import schemaJson from "../data/options-schema.json";

export interface Choice {
	value: string;
	label: string;
	/** A choice option's number, which Archipelago takes in place of the name. */
	number?: number;
}

interface OptionBase {
	key: string;
	displayName: string;
	description: string;
	richText: boolean;
	supportsWeighting: boolean;
	validKeys?: string[];
}

export type OptionDef =
	| (OptionBase & { type: "toggle"; default: boolean; choices: Choice[] })
	| (OptionBase & {
			type: "choice" | "textChoice";
			default: string | number;
			choices: Choice[];
			aliases?: Record<string, string>;
	  })
	| (OptionBase & {
			type: "range" | "namedRange";
			default: number | string;
			min: number;
			max: number;
			specialValues?: { name: string; value: number }[];
	  })
	| (OptionBase & { type: "freeText"; default: string })
	| (OptionBase & { type: "list" | "set" | "dict" | "counter" | "other"; default: unknown });

export type WeightedOptionDef = Extract<
	OptionDef,
	{ type: "toggle" | "choice" | "textChoice" | "range" | "namedRange" }
>;
export type ChoiceOptionDef = Extract<OptionDef, { type: "choice" | "textChoice" }>;
export type RangeOptionDef = Extract<OptionDef, { type: "range" | "namedRange" }>;

export interface OptionsSchema {
	game: string;
	worldVersion: string;
	minimumArchipelagoVersion: string;
	archipelagoVersion: string;
	groups: { name: string; collapsed: boolean; options: OptionDef[] }[];
	presets: Record<string, Record<string, unknown>>;
	/** Every [race, class] pair a character can be created as. */
	playableCombinations: string[][];
}

export const schema = schemaJson as OptionsSchema;
export const allOptions = schema.groups.flatMap((group) => group.options);

/**
 * What an option is set to. Weights are keyed like the YAML file: a single weighted entry is a
 * plain pick, several make Archipelago roll between them when generating.
 */
export type OptionValue =
	| { kind: "weights"; weights: Record<string, number> }
	| { kind: "text"; text: string }
	| { kind: "yaml"; yaml: string };

export interface PlayerDoc {
	name: string;
	description: string;
	values: Record<string, OptionValue>;
	/** Keys of the game section the schema doesn't know, written back untouched. */
	extraOptions: Record<string, unknown>;
	/** Top-level keys other than the ones the editor manages (triggers, other games...), written back untouched. */
	extraTop: Record<string, unknown>;
}

export const NAME_MAX_LENGTH = 16;
export const RANDOM_KEYS = ["random", "random-low", "random-high"];

// Archipelago's own options, which a randomized character shouldn't touch, and the race and class,
// picked together
const RANDOMIZE_SKIPPED = new Set([
	"progression_balancing",
	"accessibility",
	"death_link",
	"character_race",
	"character_class",
]);

export const isWeighted = (option: OptionDef): option is WeightedOptionDef =>
	option.type === "toggle" ||
	option.type === "choice" ||
	option.type === "textChoice" ||
	option.type === "range" ||
	option.type === "namedRange";

export const isRange = (option: OptionDef): option is RangeOptionDef =>
	option.type === "range" || option.type === "namedRange";

export const rangeRandomKey = (option: RangeOptionDef) => `random-range-${option.min}-${option.max}`;

/** The YAML key a plain value of an option is written as. */
export function valueKey(option: OptionDef, value: unknown): string {
	if (option.type === "toggle") {
		if (typeof value === "string" && value.toLowerCase() === "random") return "random";
		return ["true", "on", "yes", "1", "enabled"].includes(String(value).toLowerCase()) ? "true" : "false";
	}
	if (option.type === "choice" || option.type === "textChoice") {
		const key = String(value).toLowerCase();
		return (
			option.aliases?.[key] ??
			option.choices.find((c) => String(c.number) === key)?.value ??
			(option.choices.some((c) => c.value === key) || option.type === "choice" ? key : String(value))
		);
	}
	if (isRange(option)) {
		// Like Archipelago's templates, use the special name when a number has one
		const special = option.specialValues?.find((s) => String(s.value) === String(value));
		return special?.name ?? String(value);
	}
	return String(value);
}

export function defaultValue(option: OptionDef): OptionValue {
	if (isWeighted(option)) return { kind: "weights", weights: { [valueKey(option, option.default)]: 50 } };
	if (option.type === "freeText") return { kind: "text", text: String(option.default ?? "") };
	return { kind: "yaml", yaml: toYamlValue(option.default ?? []) };
}

export function defaultDoc(): PlayerDoc {
	return {
		name: "Player",
		description: `${schema.game} options`,
		values: Object.fromEntries(allOptions.map((option) => [option.key, defaultValue(option)])),
		extraOptions: {},
		extraTop: {},
	};
}

/** The single value picked, or null when several are weighted. */
export function pickedKey(value: OptionValue): string | null {
	if (value.kind !== "weights") return null;
	const picked = Object.entries(value.weights).filter(([, weight]) => weight > 0);
	return picked.length === 1 ? picked[0][0] : null;
}

const randomItem = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export function randomizedDoc(doc: PlayerDoc): PlayerDoc {
	const values = { ...doc.values };
	for (const option of allOptions) {
		if (!isWeighted(option) || RANDOMIZE_SKIPPED.has(option.key)) continue;
		const key = isRange(option)
			? valueKey(option, option.min + Math.floor(Math.random() * (option.max - option.min + 1)))
			: randomItem(option.choices).value;
		values[option.key] = { kind: "weights", weights: { [key]: 50 } };
	}
	// The class first, so that each is as likely whatever its number of races
	const characterClass = randomItem([...new Set(schema.playableCombinations.map(([, cls]) => cls))]);
	const [race] = randomItem(schema.playableCombinations.filter(([, cls]) => cls === characterClass));
	values.character_race = { kind: "weights", weights: { [race]: 50 } };
	values.character_class = { kind: "weights", weights: { [characterClass]: 50 } };
	return { ...doc, values };
}

export function applyPreset(doc: PlayerDoc, preset: Record<string, unknown>): PlayerDoc {
	const values = { ...doc.values };
	for (const [key, raw] of Object.entries(preset)) {
		const option = allOptions.find((o) => o.key === key);
		if (option) values[key] = readValue(option, raw);
	}
	return { ...doc, values };
}

/** Problems that would make Archipelago reject the file. */
export function validate(doc: PlayerDoc): string[] {
	const problems: string[] = [];
	if (!doc.name.trim()) problems.push("The slot name is required.");
	if (doc.name.length > NAME_MAX_LENGTH) problems.push(`The slot name is limited to ${NAME_MAX_LENGTH} characters.`);
	for (const option of allOptions) {
		const value = doc.values[option.key];
		if (value?.kind === "weights") {
			if (!Object.values(value.weights).some((weight) => weight > 0))
				problems.push(`${option.displayName}: give at least one value a weight.`);
			if (isRange(option)) {
				for (const key of Object.keys(value.weights)) {
					const number = Number(key);
					if (
						key.trim() !== "" &&
						Number.isInteger(number) &&
						(number < option.min || number > option.max) &&
						!option.specialValues?.some((s) => s.value === number)
					)
						problems.push(`${option.displayName}: ${number} is outside ${option.min}-${option.max}.`);
				}
			}
		} else if (value?.kind === "yaml") {
			try {
				YAML.parse(value.yaml);
			} catch (error) {
				problems.push(`${option.displayName}: invalid YAML (${(error as Error).message.split("\n")[0]}).`);
			}
		}
	}
	// The world rerolls a race and a class that can't go together, but only into the other values weighted
	const races = weightedKeys(doc, "character_race");
	const classes = weightedKeys(doc, "character_class");
	if (
		races.length > 0 &&
		classes.length > 0 &&
		!schema.playableCombinations.some(([race, cls]) => races.includes(race) && classes.includes(cls))
	)
		problems.push(
			races.length === 1 && classes.length === 1
				? `Race and Class: ${withArticle(choiceLabel("character_race", races[0]), "A")} can't be ${withArticle(choiceLabel("character_class", classes[0]), "a")}.`
				: "Race and Class: none of the races weighted can be any of the classes weighted.",
		);
	return problems;
}

const withArticle = (noun: string, article: "A" | "a") => `${article}${/^[aeiou]/i.test(noun) ? "n" : ""} ${noun}`;

function choiceLabel(key: string, value: string) {
	const option = allOptions.find((o) => o.key === key) as ChoiceOptionDef;
	return option.choices.find((c) => c.value === value)?.label ?? value;
}

function weightedKeys(doc: PlayerDoc, key: string): string[] {
	const value = doc.values[key];
	if (value?.kind !== "weights") return [];
	const keys = Object.keys(value.weights).filter((k) => value.weights[k] > 0);
	const option = allOptions.find((o) => o.key === key) as ChoiceOptionDef;
	return keys.includes("random") ? option.choices.map((c) => c.value) : keys;
}

// ---------------------------------------------------------------------------------------------
// Reading

export function parsePlayerYaml(text: string): PlayerDoc {
	const documents = YAML.parseAllDocuments(text);
	if (documents.length === 0) throw new Error("The file is empty.");
	const errors = documents.flatMap((d) => ("errors" in d ? d.errors : []));
	if (errors.length > 0) throw new Error(`The file isn't valid YAML: ${errors[0].message}`);

	const contents = documents
		.map((d) => d.toJS() as Record<string, unknown> | null)
		.filter((d) => d && typeof d === "object");
	const data = contents.find((d) => d![schema.game] !== undefined) ?? contents[0];
	if (!data) throw new Error("The file doesn't hold player options.");

	const section = (data[schema.game] ?? {}) as Record<string, unknown>;
	const known = new Set(allOptions.map((o) => o.key));
	const doc: PlayerDoc = {
		name: String(data.name ?? ""),
		description: String(data.description ?? ""),
		values: Object.fromEntries(
			allOptions.map((option) => [
				option.key,
				section[option.key] === undefined ? defaultValue(option) : readValue(option, section[option.key]),
			]),
		),
		extraOptions: Object.fromEntries(Object.entries(section).filter(([key]) => !known.has(key))),
		extraTop: Object.fromEntries(
			Object.entries(data).filter(
				([key]) => !["name", "description", "game", "requires", schema.game].includes(key),
			),
		),
	};
	return doc;
}

function readValue(option: OptionDef, raw: unknown): OptionValue {
	if (isWeighted(option)) {
		const weights: Record<string, number> = {};
		if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
			for (const [key, weight] of Object.entries(raw as Record<string, unknown>)) {
				const normalized = valueKey(option, key);
				weights[normalized] = (weights[normalized] ?? 0) + (Number(weight) || 0);
			}
		} else {
			weights[valueKey(option, raw)] = 50;
		}
		return { kind: "weights", weights };
	}
	if (option.type === "freeText") return { kind: "text", text: String(raw ?? "") };
	return { kind: "yaml", yaml: toYamlValue(raw) };
}

// ---------------------------------------------------------------------------------------------
// Writing

export function toPlayerYaml(doc: PlayerDoc): string {
	const lines: string[] = [
		`# Archipelago player options for ${schema.game}, made with the ArchipelaWoW Launcher.`,
		`# The slot name is what you use in game to link your character: .ap connect <name>`,
		"",
		`name: ${yamlScalar(doc.name)}`,
		`description: ${yamlScalar(doc.description)}`,
		`game: ${yamlScalar(schema.game)}`,
		"requires:",
		`  version: ${schema.minimumArchipelagoVersion}`,
		"  game:",
		`    ${yamlScalar(schema.game)}: ${schema.worldVersion}`,
		"",
		`${yamlScalar(schema.game)}:`,
	];

	for (const group of schema.groups) {
		const banner = "#".repeat(group.name.length + 4);
		lines.push(`  ${banner}`, `  # ${group.name} #`, `  ${banner}`);
		for (const option of group.options) {
			lines.push(`  ${option.key}:`);
			for (const line of commentLines(option)) lines.push(`    #${line ? " " + line : ""}`);
			lines.push(
				...valueLines(option, doc.values[option.key] ?? defaultValue(option)).map((line) => `    ${line}`),
			);
			lines.push("");
		}
	}

	if (Object.keys(doc.extraOptions).length > 0) {
		lines.push("  # Options this version of the launcher doesn't know about");
		lines.push(...indent(YAML.stringify(doc.extraOptions), 2));
	}
	if (Object.keys(doc.extraTop).length > 0) {
		lines.push("");
		lines.push(...YAML.stringify(doc.extraTop).trimEnd().split("\n"));
	}
	return lines.join("\n").trimEnd() + "\n";
}

function commentLines(option: OptionDef): string[] {
	const lines = option.description ? option.description.split("\n") : [];
	if (isRange(option)) {
		if (lines.length > 0) lines.push("");
		lines.push(`Minimum value is ${option.min}`, `Maximum value is ${option.max}`);
	}
	return lines;
}

function valueLines(option: OptionDef, value: OptionValue): string[] {
	if (value.kind === "text") return [yamlScalar(value.text)];
	if (value.kind === "yaml") {
		const text = value.yaml.trim() || "[]";
		return text.split("\n");
	}
	if (!isWeighted(option)) return [];

	// Every known value is listed, like Archipelago's templates, so the file is easy to tweak by hand
	const keys = isRange(option)
		? [...RANDOM_KEYS, rangeRandomKey(option), ...(option.specialValues ?? []).map((s) => s.name)]
		: option.choices.map((c) => c.value);
	for (const key of Object.keys(value.weights)) if (!keys.includes(key)) keys.push(key);
	return keys.map((key) => `${yamlKey(key)}: ${value.weights[key] ?? 0}`);
}

function yamlKey(key: string) {
	return /^-?\d+$/.test(key) ? key : yamlScalar(key);
}

function yamlScalar(value: unknown) {
	// Kept on one line, as a continuation wouldn't be indented under its key: long values aren't folded,
	// and line breaks are written the JSON way, which YAML reads
	const text = YAML.stringify(value, { singleQuote: true, lineWidth: 0 }).trimEnd();
	return text.includes("\n") ? JSON.stringify(value) : text;
}

export function toYamlValue(value: unknown): string {
	if (Array.isArray(value) && value.length === 0) return "[]";
	if (value !== null && typeof value === "object" && Object.keys(value).length === 0) return "{}";
	return YAML.stringify(value).trimEnd();
}

function indent(text: string, spaces: number) {
	return text
		.trimEnd()
		.split("\n")
		.map((line) => " ".repeat(spaces) + line);
}
