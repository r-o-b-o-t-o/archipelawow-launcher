import { createSignal } from "solid-js";

const [now, setNow] = createSignal(Date.now());
setInterval(() => setNow(Date.now()), 1000);

/** The current time, updated every second. */
export { now };
