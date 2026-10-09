// Unsaved edits, which the launcher asks about before its window closes on them.
import { useBeforeLeave } from "@solidjs/router";
import { createEffect, onCleanup } from "solid-js";

import { api } from "./api";

const editors = new Set<symbol>();

function track(editor: symbol, dirty: boolean) {
	const before = editors.size > 0;
	if (dirty) editors.add(editor);
	else editors.delete(editor);
	const after = editors.size > 0;
	if (after !== before) api.app.setUnsavedChanges(after).catch(() => {});
}

/** Asks before leaving the page or quitting while `dirty` is true. */
export function guardUnsaved(dirty: () => boolean) {
	const editor = Symbol();
	createEffect(() => track(editor, dirty()));
	onCleanup(() => track(editor, false));
	useBeforeLeave((event) => {
		if (dirty() && !event.defaultPrevented && !confirm("Discard the unsaved changes?")) event.preventDefault();
	});
}
