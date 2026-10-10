import { For, type JSX, type ParentProps, Show, onCleanup, splitProps } from "solid-js";

import Icon, { type IconName } from "./Icon";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
	primary: "bg-gold text-zinc-950 hover:bg-gold-soft font-semibold shadow-sm shadow-gold/20",
	secondary: "bg-surface-3 text-zinc-100 hover:bg-surface-4 border border-white/10",
	danger: "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30",
	ghost: "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
};

export function Button(
	props: ParentProps<{
		variant?: ButtonVariant;
		size?: "sm" | "md";
		icon?: IconName;
		busy?: boolean;
		disabled?: boolean;
		title?: string;
		class?: string;
		type?: "button" | "submit";
		onClick?: (event: MouseEvent) => void;
	}>,
) {
	return (
		<button
			type={props.type ?? "button"}
			data-tooltip={props.title}
			disabled={props.disabled || props.busy}
			onClick={(event) => props.onClick?.(event)}
			class={`inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
				props.size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4"
			} ${buttonVariants[props.variant ?? "secondary"]} ${props.class ?? ""}`}
		>
			<Show when={props.busy} fallback={props.icon && <Icon name={props.icon} class="size-4 shrink-0" />}>
				<Spinner />
			</Show>
			{props.children}
		</button>
	);
}

export function IconButton(props: {
	icon: IconName;
	title: string;
	onClick: () => void;
	disabled?: boolean;
	class?: string;
}) {
	return (
		<button
			type="button"
			aria-label={props.title}
			data-tooltip={props.title}
			disabled={props.disabled}
			onClick={() => props.onClick()}
			class={`inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100 disabled:opacity-30 ${props.class ?? ""}`}
		>
			<Icon name={props.icon} />
		</button>
	);
}

export function Spinner(props: { class?: string }) {
	return (
		<span
			class={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${props.class ?? ""}`}
		/>
	);
}

export function Card(
	props: ParentProps<{
		title?: JSX.Element;
		icon?: IconName;
		actions?: JSX.Element;
		class?: string;
		bodyClass?: string;
	}>,
) {
	return (
		<section class={`flex flex-col rounded-xl border border-white/5 bg-surface-2 ${props.class ?? ""}`}>
			<Show when={props.title || props.actions}>
				<header class="flex items-center gap-2 border-b border-white/5 px-4 py-3">
					<Show when={props.icon}>{(icon) => <Icon name={icon()} class="size-4 text-gold" />}</Show>
					<h2 class="font-semibold text-zinc-100">{props.title}</h2>
					<div class="ml-auto flex items-center gap-2">{props.actions}</div>
				</header>
			</Show>
			<div class={props.bodyClass ?? "p-4"}>{props.children}</div>
		</section>
	);
}

export type Tone = "green" | "amber" | "red" | "zinc" | "blue";

const tones: Record<Tone, string> = {
	green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
	amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
	red: "bg-red-500/10 text-red-300 border-red-500/30",
	zinc: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
	blue: "bg-sky-500/10 text-sky-300 border-sky-500/30",
};

const dots: Record<Tone, string> = {
	green: "bg-emerald-400",
	amber: "bg-amber-400",
	red: "bg-red-400",
	zinc: "bg-zinc-500",
	blue: "bg-sky-400",
};

export function Badge(props: ParentProps<{ tone: Tone; pulse?: boolean }>) {
	return (
		<span
			class={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[props.tone]}`}
		>
			<Dot tone={props.tone} pulse={props.pulse} />
			{props.children}
		</span>
	);
}

export function Dot(props: { tone: Tone; pulse?: boolean }) {
	return (
		<span
			class={`inline-block size-2 shrink-0 rounded-full ${dots[props.tone]} ${props.pulse ? "animate-pulse" : ""}`}
		/>
	);
}

// No size in the base: Tailwind doesn't settle conflicting utilities by their order in the class list
export const inputBase =
	"rounded-lg border border-white/10 bg-surface-1 text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-gold/60 disabled:opacity-50";
export const inputClass = `${inputBase} h-9 w-full px-3`;

export function Field(props: ParentProps<{ label: string; hint?: JSX.Element; class?: string }>) {
	return (
		<label class={`flex flex-col gap-1.5 ${props.class ?? ""}`}>
			<span class="text-[13px] font-medium text-zinc-300">{props.label}</span>
			{props.children}
			<Show when={props.hint}>
				<span class="text-xs text-zinc-500">{props.hint}</span>
			</Show>
		</label>
	);
}

export function TextInput(props: JSX.InputHTMLAttributes<HTMLInputElement> & { onValue?: (value: string) => void }) {
	const [local, rest] = splitProps(props, ["class", "onValue"]);
	return (
		<input
			{...rest}
			class={`${inputBase} h-9 px-3 ${local.class ?? "w-full"}`}
			onInput={(e) => local.onValue?.(e.currentTarget.value)}
		/>
	);
}

export function Select<T extends string | number>(props: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	disabled?: boolean;
	class?: string;
}) {
	return (
		<select
			class={`${inputBase} h-9 cursor-pointer px-3 ${props.class ?? "w-full"}`}
			disabled={props.disabled}
			value={String(props.value)}
			onChange={(e) => {
				const option = props.options.find((o) => String(o.value) === e.currentTarget.value);
				if (option) props.onChange(option.value);
			}}
		>
			<For each={props.options}>{(option) => <option value={String(option.value)}>{option.label}</option>}</For>
		</select>
	);
}

export function Switch(props: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	label?: JSX.Element;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={props.checked}
			disabled={props.disabled}
			onClick={() => props.onChange(!props.checked)}
			class="group inline-flex items-center gap-3 text-left disabled:opacity-50"
		>
			<span
				class={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${props.checked ? "bg-gold" : "bg-surface-4"}`}
			>
				<span
					class={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${props.checked ? "left-[18px]" : "left-0.5"}`}
				/>
			</span>
			<Show when={props.label}>
				<span class="text-zinc-200">{props.label}</span>
			</Show>
		</button>
	);
}

export function ProgressBar(props: { value: number | null; class?: string }) {
	return (
		<div class={`h-2 overflow-hidden rounded-full bg-surface-4 ${props.class ?? ""}`}>
			<Show
				when={props.value !== null}
				fallback={
					<div class="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-gold/70" />
				}
			>
				<div
					class="h-full rounded-full bg-gold transition-[width] duration-300"
					style={{ width: `${Math.round((props.value ?? 0) * 100)}%` }}
				/>
			</Show>
		</div>
	);
}

export function Modal(
	props: ParentProps<{ title: string; onClose: () => void; footer?: JSX.Element; wide?: boolean }>,
) {
	const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && props.onClose();
	document.addEventListener("keydown", onKeyDown);
	onCleanup(() => document.removeEventListener("keydown", onKeyDown));
	return (
		<div
			class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
			onClick={() => props.onClose()}
		>
			<div
				class={`flex max-h-full w-full flex-col rounded-xl border border-white/10 bg-surface-2 shadow-2xl ${props.wide ? "max-w-4xl" : "max-w-lg"}`}
				onClick={(e) => e.stopPropagation()}
			>
				<header class="flex items-center border-b border-white/5 px-5 py-3">
					<h2 class="font-semibold text-zinc-100">{props.title}</h2>
					<IconButton icon="x" title="Close" class="ml-auto" onClick={props.onClose} />
				</header>
				<div class="min-h-0 overflow-auto p-5">{props.children}</div>
				<Show when={props.footer}>
					<footer class="flex justify-end gap-2 border-t border-white/5 px-5 py-3">{props.footer}</footer>
				</Show>
			</div>
		</div>
	);
}

export function Callout(props: ParentProps<{ tone: "amber" | "red" | "blue"; icon?: IconName; class?: string }>) {
	const colors = {
		amber: "border-amber-500/30 bg-amber-500/5 text-amber-200",
		red: "border-red-500/30 bg-red-500/5 text-red-200",
		blue: "border-sky-500/30 bg-sky-500/5 text-sky-200",
	};
	return (
		<div class={`flex items-start gap-3 rounded-lg border px-4 py-3 ${colors[props.tone]} ${props.class ?? ""}`}>
			<Icon name={props.icon ?? (props.tone === "blue" ? "info" : "alert")} class="mt-0.5 size-4 shrink-0" />
			<div class="min-w-0 flex-1">{props.children}</div>
		</div>
	);
}

export function PageHeader(props: ParentProps<{ title: string; subtitle?: JSX.Element }>) {
	return (
		<header class="flex items-center gap-4 border-b border-white/5 px-8 py-5">
			<div class="min-w-0">
				<h1 class="text-xl font-semibold text-zinc-50">{props.title}</h1>
				<Show when={props.subtitle}>
					<p class="mt-0.5 text-[13px] text-zinc-400">{props.subtitle}</p>
				</Show>
			</div>
			<div class="ml-auto flex items-center gap-2">{props.children}</div>
		</header>
	);
}

export function Code(props: ParentProps) {
	return <code class="rounded bg-surface-4 px-1.5 py-0.5 font-mono text-[12px] text-zinc-200">{props.children}</code>;
}
