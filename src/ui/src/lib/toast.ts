import { createSignal } from "solid-js";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 1;

export { toasts };

export function toast(message: string, kind: ToastKind = "info") {
	const id = nextId++;
	setToasts((list) => [...list, { id, kind, message }]);
	setTimeout(() => dismissToast(id), kind === "error" ? 8000 : 4000);
}

export function dismissToast(id: number) {
	setToasts((list) => list.filter((t) => t.id !== id));
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs an action and reports a failure as a toast instead of throwing. */
export async function attempt<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
	try {
		const result = await action();
		if (success) toast(success, "success");
		return result;
	} catch (error) {
		toast(errorMessage(error), "error");
		return undefined;
	}
}
