import { A } from "@solidjs/router";
import { Show, createEffect, createResource, createSignal, on } from "solid-js";

import TaskPanel from "../components/TaskPanel";
import { Button, Callout, Card, Code, Field, PageHeader, Select, TextInput } from "../components/ui";
import { type GameClientStatus, api } from "../lib/api";
import { confirmDialog } from "../lib/dialog";
import { loaded } from "../lib/resource";
import { server, task } from "../lib/store";
import { attempt } from "../lib/toast";

const DEFAULT_LOCALE = "enUS";

const LOCALE_NAMES: Record<string, string> = {
	deDE: "German",
	enCN: "English (China)",
	enGB: "English (UK)",
	enUS: "English (US)",
	esES: "Spanish (Spain)",
	esMX: "Spanish (Latin America)",
	frFR: "French",
	koKR: "Korean",
	ruRU: "Russian",
	zhCN: "Chinese (Simplified)",
	zhTW: "Chinese (Traditional)",
};

const localeLabel = (code: string) => (LOCALE_NAMES[code] ? `${LOCALE_NAMES[code]} (${code})` : code);

/** Downloads the stock 3.3.5a client and starts it on the local realm, or another one. */
export default function Game() {
	const [status, { mutate, refetch }] = createResource(api.gameClient.getStatus);
	const [locales] = createResource(api.gameClient.getLocales);
	const [chosenLocale, setChosenLocale] = createSignal<string | null>(null);
	// Null until edited: shows the saved one
	const [editedRealmlist, setEditedRealmlist] = createSignal<string | null>(null);
	const [playing, setPlaying] = createSignal(false);
	const [deleting, setDeleting] = createSignal(false);
	// A download or deletion started before the page was opened ends without it hearing back
	createEffect(
		on(
			task,
			(current, previous) => {
				if (previous && !current) void refetch();
			},
			{ defer: true },
		),
	);

	const available = () => loaded(locales) ?? [];
	const defaultLocale = () =>
		available().length === 0 || available().includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : available()[0];
	// A download that stopped halfway resumes in its own locale
	const locale = () => chosenLocale() ?? status()?.partialDownload ?? defaultLocale();
	const localeOptions = () =>
		(available().includes(locale()) ? available() : [locale(), ...available()]).map((code) => ({
			value: code,
			label: localeLabel(code),
		}));
	const resuming = () => status()?.partialDownload === locale();

	const realmlist = () => editedRealmlist() ?? status()?.realmlist ?? "";
	const playsLocally = () => !realmlist().trim();
	const realmRunning = () => server("authserver")?.state === "running" && server("worldserver")?.state === "running";

	const finish = (result: GameClientStatus | undefined) => {
		if (result) mutate(result);
	};

	const download = async () => {
		const partial = status()?.partialDownload;
		if (
			partial &&
			partial !== locale() &&
			!(await confirmDialog({
				title: "Discard the partial download",
				message: `Downloading in ${localeLabel(locale())} deletes the files downloaded so far in ${localeLabel(partial)}.`,
				confirm: "Download",
				danger: true,
			}))
		)
			return;
		finish(await attempt(() => api.gameClient.download(locale()), "The game client is ready to play."));
	};

	const remove = async () => {
		const installed = status()?.installed;
		if (
			!(await confirmDialog({
				title: installed ? "Delete the game client" : "Delete the partial download",
				message: installed
					? `Delete the game client from ${status()!.path}? Its settings, addons and screenshots go with it.`
					: "Delete the files downloaded so far? Downloading again starts over.",
				confirm: "Delete",
				danger: true,
			}))
		)
			return;
		setDeleting(true);
		finish(await attempt(api.gameClient.delete, installed ? "Game client deleted." : "Partial download deleted."));
		setDeleting(false);
	};

	const play = async () => {
		setPlaying(true);
		const result = await attempt(() => api.gameClient.play(realmlist().trim() || null));
		setPlaying(false);
		if (!result) return;
		mutate(result);
		setEditedRealmlist(null);
	};

	return (
		<>
			<PageHeader title="Game" subtitle="Get World of Warcraft 3.3.5a and play." />

			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
					<TaskPanel />

					<Card
						title="Game client"
						icon="download"
						actions={
							<Show when={status()?.installed || status()?.partialDownload}>
								<Button
									size="sm"
									variant="danger"
									icon="trash"
									disabled={task() !== null}
									onClick={remove}
								>
									{status()?.installed ? "Delete" : "Delete partial download"}
								</Button>
							</Show>
						}
					>
						<Show
							when={status()?.installed}
							fallback={
								<div class="flex flex-col gap-4">
									<p class="text-[13px] text-zinc-400">
										Downloads the stock World of Warcraft 3.3.5a (12340) client in the language of
										your choice. It's a large download: if it stops, downloading again resumes where
										it left off.
									</p>
									<Field
										label="Language"
										class="max-w-xs"
										hint={
											locales.error
												? "Couldn't reach the download server to list the languages."
												: undefined
										}
									>
										<Select
											value={locale()}
											options={localeOptions()}
											onChange={setChosenLocale}
											disabled={task() !== null}
										/>
									</Field>
									<Button
										variant="primary"
										icon="download"
										class="self-start"
										disabled={task() !== null || !status()}
										onClick={download}
									>
										{resuming() ? "Resume download" : "Download"}
									</Button>
								</div>
							}
						>
							<div class="flex flex-wrap items-center gap-3">
								<p class="text-[13px] text-zinc-400">
									World of Warcraft 3.3.5a (12340)
									<Show when={status()?.locale}>{(code) => <>, {localeLabel(code())}</>}</Show>, in{" "}
									<Code>{status()!.path}</Code>
								</p>
								<Button
									size="sm"
									icon="folder"
									class="ml-auto"
									onClick={() => attempt(() => api.app.openPath("gameClient"))}
								>
									Open folder
								</Button>
							</div>
						</Show>
					</Card>

					<Show when={status()?.installed}>
						<Card title="Play" icon="sword">
							<form
								class="flex flex-col gap-4"
								onSubmit={(event) => {
									event.preventDefault();
									void play();
								}}
							>
								<Field
									label="Realmlist"
									class="max-w-md"
									hint={
										<>
											Leave it empty to play on your own realm, at {status()!.localRealmlist}.
											Playing writes it to the client's <Code>realmlist.wtf</Code>.
										</>
									}
								>
									<TextInput
										value={realmlist()}
										onValue={setEditedRealmlist}
										placeholder={status()!.localRealmlist}
										spellcheck={false}
									/>
								</Field>
								<Show when={playsLocally() && !realmRunning()}>
									<Callout tone="amber">
										Your realm isn't running: start the servers from the{" "}
										<A href="/" class="underline">
											dashboard
										</A>
										, and create an account there, before logging in.
									</Callout>
								</Show>
								<Button
									type="submit"
									variant="primary"
									icon="play"
									busy={playing()}
									disabled={deleting()}
									class="self-start"
								>
									Play
								</Button>
							</form>
						</Card>
					</Show>
				</div>
			</div>
		</>
	);
}
