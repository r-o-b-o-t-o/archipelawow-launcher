import { Show } from "solid-js";

import { api } from "../lib/api";
import { task } from "../lib/store";
import { attempt } from "../lib/toast";
import { Button, ProgressBar, Spinner } from "./ui";

/** The long operation in progress, if any. */
export default function TaskPanel() {
	return (
		<Show when={task()}>
			{(current) => (
				<div class="rounded-xl border border-gold/30 bg-gold/5 p-4">
					<div class="flex items-center gap-3">
						<Spinner class="text-gold" />
						<div class="min-w-0">
							<div class="font-semibold text-zinc-100">{current().title}</div>
							<div class="truncate text-[13px] text-zinc-400">{current().stage || "Working..."}</div>
						</div>
						<Button
							size="sm"
							variant="ghost"
							icon="x"
							class="ml-auto"
							onClick={() => attempt(api.task.cancel)}
						>
							Cancel
						</Button>
					</div>
					<ProgressBar value={current().progress} class="mt-3" />
					<Show when={current().progress !== null}>
						<div class="mt-1.5 flex justify-between text-xs text-zinc-400 tabular-nums">
							<span>{current().detail}</span>
							<span>{Math.floor((current().progress ?? 0) * 100)}%</span>
						</div>
					</Show>
				</div>
			)}
		</Show>
	);
}
