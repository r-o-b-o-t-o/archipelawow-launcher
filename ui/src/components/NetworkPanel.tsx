import { For, Show, createEffect, createSignal, on } from "solid-js";

import { type NetworkStatus, type RealmAccess, api } from "../lib/api";
import { attempt } from "../lib/toast";
import Icon, { type IconName } from "./Icon";
import { Button, Callout, Code, CopyLine, Field, TextInput } from "./ui";

const choices: { access: RealmAccess; label: string; icon: IconName; description: string }[] = [
	{ access: "local", label: "This computer", icon: "monitor", description: "Only players on this computer." },
	{
		access: "lan",
		label: "Local network",
		icon: "network",
		description: "Players on the same network as this computer, such as at home.",
	},
	{
		access: "internet",
		label: "Internet",
		icon: "globe",
		description: "Friends anywhere, once your router lets them through.",
	},
];

/** Who can join the realm: the addresses the authserver hands the game clients. */
export default function NetworkPanel(props: { status?: NetworkStatus; onChange: (status: NetworkStatus) => void }) {
	const status = () => props.status;
	const [access, setAccess] = createSignal<RealmAccess>("local");
	const [publicAddress, setPublicAddress] = createSignal("");
	const [busy, setBusy] = createSignal<"apply" | "find" | null>(null);
	createEffect(
		on(status, (s) => {
			if (!s) return;
			setAccess(s.access ?? "local");
			setPublicAddress(s.publicAddress ?? "");
		}),
	);

	const applied = () =>
		status()?.access === access() &&
		(access() !== "internet" || status()?.publicAddress === publicAddress().trim());

	const apply = async () => {
		setBusy("apply");
		const result = await attempt(
			() => api.network.set(access(), access() === "internet" ? publicAddress() : null),
			"Saved. A running authserver picks it up within a minute.",
		);
		setBusy(null);
		if (result) props.onChange(result);
	};

	const findPublicAddress = async () => {
		setBusy("find");
		const address = await attempt(api.network.findPublicAddress);
		setBusy(null);
		if (address) setPublicAddress(address);
	};

	return (
		<div class="flex flex-col gap-4">
			<div class="grid grid-cols-3 gap-3">
				<For each={choices}>
					{(choice) => (
						<button
							type="button"
							onClick={() => setAccess(choice.access)}
							class={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
								access() === choice.access
									? "border-gold/60 bg-gold/5"
									: "border-white/10 bg-surface-1 hover:border-white/20"
							}`}
						>
							<span
								class={`flex items-center gap-2 text-[13px] font-semibold ${access() === choice.access ? "text-gold" : "text-zinc-100"}`}
							>
								<Icon name={choice.icon} class="size-4" />
								{choice.label}
							</span>
							<span class="text-xs text-zinc-400">{choice.description}</span>
						</button>
					)}
				</For>
			</div>

			<Show when={access() !== "local"}>
				<p class="text-[13px] text-zinc-400">
					<Show
						when={status()?.lan}
						fallback={<span class="text-amber-300">This computer isn't connected to a network.</span>}
					>
						{(lan) => (
							<>
								This computer's address on your local network is <Code>{lan().address}</Code>. The
								launcher looks it up again each time the authserver starts, should it change.
							</>
						)}
					</Show>
				</p>
			</Show>

			<Show when={access() === "internet"}>
				<div class="flex items-end gap-3">
					<Field
						label="Public address"
						class="w-72"
						hint="Your public IP address, or a host name pointing to it."
					>
						<TextInput value={publicAddress()} onValue={setPublicAddress} placeholder="203.0.113.7" />
					</Field>
					<Button
						icon="globe"
						busy={busy() === "find"}
						title="Looks it up with ipify.org"
						onClick={findPublicAddress}
						class="mb-5"
					>
						Find it
					</Button>
				</div>
			</Show>

			<Button
				variant="primary"
				icon="check"
				class="self-start"
				busy={busy() === "apply"}
				disabled={applied() || (access() === "internet" && !publicAddress().trim())}
				onClick={apply}
			>
				Apply
			</Button>

			<Show when={status()?.access === access() && access() !== "local" ? status() : undefined}>
				{(current) => <Instructions status={current()} />}
			</Show>
		</div>
	);
}

function Instructions(props: { status: NetworkStatus }) {
	const internet = () => props.status.access === "internet";
	const address = () => (internet() ? props.status.publicAddress : props.status.lan?.address) ?? "";

	return (
		<div class="flex flex-col gap-3 border-t border-white/5 pt-4 text-[13px] text-zinc-400">
			<div>
				<p>
					The other players make the <Code>realmlist.wtf</Code> of their client read:
				</p>
				<CopyLine text={`set realmlist ${address()}`} class="mt-2" />
				<p class="mt-2 text-xs text-zinc-500">
					<Show when={internet() && props.status.lan}>
						{(lan) => (
							<>
								Players on your local network can use <Code>{lan().address}</Code> instead.{" "}
							</>
						)}
					</Show>
					On this computer, keep <Code>127.0.0.1</Code>.
				</p>
			</div>

			<Show when={internet()}>
				<Callout tone="amber" icon="globeLock">
					<p>
						In your router's control panel, forward the TCP ports <Code>{props.status.authServerPort}</Code>{" "}
						(authserver) and <Code>{props.status.worldServerPort}</Code> (worldserver) to this computer,{" "}
						<Code>{props.status.lan?.address ?? "?"}</Code>. The setting is often called port forwarding,
						virtual servers or NAT: look up your router's model if you can't find it.
					</p>
					<p class="mt-2">
						Then, with the servers started, check that the ports are open from the internet with{" "}
						<a
							class="text-gold hover:underline"
							href="https://www.yougetsignal.com/tools/open-ports/"
							target="_blank"
						>
							this open port checker
						</a>
						.
					</p>
				</Callout>
				<p class="text-xs text-zinc-500">
					Unless your internet provider gave you a fixed IP address, it changes from time to time: a dynamic
					DNS service gives you a host name that follows it.
				</p>
			</Show>

			<p class="text-xs text-zinc-500">
				The first time each server starts, Windows asks whether to let it through its firewall: other players
				need it. If you didn't allow them, allow the authserver and worldserver in Windows Security's firewall
				settings.
			</p>
		</div>
	);
}
