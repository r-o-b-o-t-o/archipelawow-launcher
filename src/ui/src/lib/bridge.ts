// RPC with the launcher over WebView2 web messages, see Bridge/BridgeHost.cs.

interface WebView {
	postMessage(message: unknown): void;
	addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

type Message = { id: number; result?: unknown; error?: string } | { event: string; data: unknown };

const webview: WebView | undefined = (window as { chrome?: { webview?: WebView } }).chrome?.webview;

const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const listeners = new Map<string, Set<(data: any) => void>>();
let nextId = 1;

webview?.addEventListener("message", (event) => {
	const message = event.data as Message;
	if ("id" in message) {
		const call = pending.get(message.id);
		if (!call) return;
		pending.delete(message.id);
		if (message.error != null) call.reject(new Error(message.error));
		else call.resolve(message.result);
	} else {
		listeners.get(message.event)?.forEach((listener) => listener(message.data));
	}
});

/** False when the page is opened in a regular browser rather than the launcher. */
export const inLauncher = webview !== undefined;

export function call<T = void>(method: string, params?: unknown): Promise<T> {
	if (!webview) return Promise.reject(new Error("Not running inside the launcher."));
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		webview.postMessage({ id, method, params });
	});
}

/** Subscribes to an event pushed by the launcher; returns the unsubscribe function. */
export function on<T>(event: string, listener: (data: T) => void): () => void {
	let set = listeners.get(event);
	if (!set) listeners.set(event, (set = new Set()));
	set.add(listener);
	return () => set.delete(listener);
}
