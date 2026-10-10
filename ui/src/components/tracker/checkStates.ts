import type { CheckState } from "../../tracker/state";

/** The colours of PopTracker: in logic, sequence break, out of logic, checked, plus one for seeds without rules. */
export const stateColors: Record<CheckState, string> = {
	available: "#22c55e",
	sequenceBreak: "#facc15",
	blocked: "#ef4444",
	checked: "#71717a",
	unknown: "#38bdf8",
};

export const stateLabels: Record<CheckState, string> = {
	available: "In logic",
	sequenceBreak: "Out of logic, but doable",
	blocked: "Out of logic",
	checked: "Checked",
	unknown: "No logic",
};
