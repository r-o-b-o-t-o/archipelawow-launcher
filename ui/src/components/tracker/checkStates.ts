import type { CheckState } from "../../tracker/state";

/**
 * The colours of PopTracker: in logic, sequence break, out of logic, checked, plus one for a spot out of logic whose
 * check is in logic elsewhere, and one for seeds without rules.
 */
export const stateColors: Record<CheckState, string> = {
	available: "#22c55e",
	sequenceBreak: "#facc15",
	elsewhere: "#931eed",
	blocked: "#ef4444",
	checked: "#71717a",
	unknown: "#38bdf8",
};

export const stateLabels: Record<CheckState, string> = {
	available: "In logic",
	sequenceBreak: "Out of logic, but doable",
	elsewhere: "Out of logic here, in logic elsewhere",
	blocked: "Out of logic",
	checked: "Checked",
	unknown: "No logic",
};
