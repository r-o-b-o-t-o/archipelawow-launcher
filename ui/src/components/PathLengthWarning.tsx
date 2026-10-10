import { Show } from "solid-js";

import type { SetupStatus } from "../lib/api";
import { appInfo } from "../lib/store";
import { Callout, Code } from "./ui";

/** Warns when the installation sits too deep for worldserver's database updater. */
export default function PathLengthWarning(props: { status: SetupStatus | undefined }) {
	return (
		<Show when={props.status && props.status.sourcePathLength > props.status.sourcePathLimit}>
			<Callout tone="red">
				The launcher's folder is nested too deep. The server can't open files with paths longer than{" "}
				{props.status!.sourcePathLimit} characters and needs {props.status!.sourcePathLength} here, so it fails
				to set up or update the database.{" "}
				<Show
					when={appInfo()?.installation === "setup"}
					fallback={
						<>
							Move the whole folder closer to the root of a drive, e.g. <Code>C:\Games\ArchipelaWoW</Code>
							.
						</>
					}
				>
					The setup keeps it in your Windows account's folder: use the portable archive instead, extracted
					close to the root of a drive, e.g. into <Code>C:\Games\ArchipelaWoW</Code>, and move what this
					folder holds into it.
				</Show>
			</Callout>
		</Show>
	);
}
