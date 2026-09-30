import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { createEffect, onCleanup, onMount } from "solid-js";
import { api, type TerminalName } from "../lib/api";
import { on } from "../lib/bridge";
import { appInfo } from "../lib/store";

const clearCallbacks = new Map<TerminalName, Set<() => void>>();

/** Clears a terminal's history in the launcher and in every view showing it. */
export async function clearTerminal(name: TerminalName) {
	await api.terminal.clear(name);
	clearCallbacks.get(name)?.forEach((clear) => clear());
}

/**
 * A terminal attached to one of the launcher's pseudoconsoles. It replays the launcher's history
 * of that terminal, then follows the output chunks numbered after it.
 */
export default function Terminal(props: { name: TerminalName; class?: string }) {
	let container!: HTMLDivElement;

	onMount(() => {
		const terminal = new XTerm({
			fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
			fontSize: 13,
			lineHeight: 1.15,
			scrollback: 20000,
			// ConPTY clears the screen when a process starts: keep what was there in the scrollback
			scrollOnEraseInDisplay: true,
			theme: {
				background: "#0b0d12",
				foreground: "#d4d4d8",
				cursor: "#f5b301",
				cursorAccent: "#0b0d12",
				selectionBackground: "#f5b30155",
				black: "#1f2430",
				red: "#f87171",
				green: "#4ade80",
				yellow: "#facc15",
				blue: "#60a5fa",
				magenta: "#c084fc",
				cyan: "#22d3ee",
				white: "#d4d4d8",
				brightBlack: "#6b7280",
				brightRed: "#fca5a5",
				brightGreen: "#86efac",
				brightYellow: "#fde047",
				brightBlue: "#93c5fd",
				brightMagenta: "#d8b4fe",
				brightCyan: "#67e8f9",
				brightWhite: "#f4f4f5",
			},
		});
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(container);

		// The Windows build comes with the app info, which terminals shown on startup don't have yet
		createEffect(() => {
			terminal.options.windowsPty = { backend: "conpty", buildNumber: appInfo()?.windowsBuild };
		});

		// Ctrl+C copies when text is selected rather than interrupting the process; Ctrl+V is left to
		// the browser's paste event, which the terminal turns into input
		terminal.attachCustomKeyEventHandler((event) => {
			if (event.type !== "keydown" || !event.ctrlKey) return true;
			if (event.key === "c" && terminal.hasSelection()) {
				navigator.clipboard.writeText(terminal.getSelection());
				terminal.clearSelection();
				return false;
			}
			return event.key !== "v";
		});

		let lastSeq = 0;
		let replayed = false;
		const unsubscribe = on<{ name: string; data: string; seq: number }>("terminal.output", (chunk) => {
			// Chunks posted before the snapshot are part of it
			if (chunk.name !== props.name || !replayed || chunk.seq <= lastSeq) return;
			lastSeq = chunk.seq;
			terminal.write(chunk.data);
		});
		api.terminal.snapshot(props.name).then(({ data, seq }) => {
			terminal.write(data);
			lastSeq = seq;
			replayed = true;
		});

		const input = terminal.onData((data) => api.terminal.input(props.name, data).catch(() => {}));

		const clear = () => terminal.clear();
		if (!clearCallbacks.has(props.name)) clearCallbacks.set(props.name, new Set());
		clearCallbacks.get(props.name)!.add(clear);

		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		const observer = new ResizeObserver(() => {
			// Hidden tabs have no size
			if (container.clientWidth === 0 || container.clientHeight === 0) return;
			fit.fit();
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(
				() => api.terminal.resize(props.name, terminal.cols, terminal.rows).catch(() => {}),
				150,
			);
		});
		observer.observe(container);

		onCleanup(() => {
			clearCallbacks.get(props.name)?.delete(clear);
			clearTimeout(resizeTimer);
			observer.disconnect();
			unsubscribe();
			input.dispose();
			terminal.dispose();
		});
	});

	return <div ref={container} class={`min-h-0 overflow-hidden bg-[#0b0d12] py-2 pl-3 ${props.class ?? ""}`} />;
}
