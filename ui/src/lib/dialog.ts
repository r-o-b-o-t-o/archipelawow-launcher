// Questions asked in the page's own modals, in place of the webview's confirm and prompt
import { createSignal } from "solid-js";

export interface Dialog {
	title: string;
	message?: string;
	/** The label of the button that agrees. */
	confirm: string;
	danger?: boolean;
	/** The initial text of the field a prompt asks for, which a plain question has none of. */
	value?: string;
	resolve: (answer: string | null) => void;
}

const [dialog, setDialog] = createSignal<Dialog | null>(null);

export { dialog };

function open(options: Omit<Dialog, "resolve">) {
	// One at a time: a question asked over another cancels it
	answer(null);
	return new Promise<string | null>((resolve) => setDialog({ ...options, resolve }));
}

/** Answers the open question, with null to cancel it. */
export function answer(value: string | null) {
	const current = dialog();
	setDialog(null);
	current?.resolve(value);
}

/** Resolves to whether the user agreed. */
export async function confirmDialog(options: { title: string; message: string; confirm: string; danger?: boolean }) {
	return (await open(options)) !== null;
}

/** Resolves to the text entered, or null if cancelled. */
export function promptDialog(options: { title: string; message?: string; confirm: string; value: string }) {
	return open(options);
}
