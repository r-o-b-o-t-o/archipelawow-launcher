import { Show } from "solid-js";
import type { SetupStatus } from "../lib/api";
import { Callout, Code } from "./ui";

/** Warns when the installation sits too deep for worldserver's database updater. */
export default function PathLengthWarning(props: { status: SetupStatus | undefined }) {
	return (
		<Show when={props.status && props.status.sourcePathLength > props.status.sourcePathLimit}>
			<Callout tone="red">
				The ArchipelaWoW Launcher folder is nested too deep. The server can't open files with paths longer than{" "}
				{props.status!.sourcePathLimit} characters and needs {props.status!.sourcePathLength} here, so it fails
				to set up or update the database. Move the whole folder closer to the root of a drive, e.g.{" "}
				<Code>C:\Games\ArchipelaWoW Launcher</Code>.
			</Callout>
		</Show>
	);
}
