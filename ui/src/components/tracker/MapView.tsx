import { createEffect, createMemo, createSignal, For, Index, on, onCleanup, onMount, Show } from "solid-js";
import { projectSpot, type Check } from "../../tracker/checks";
import { asset } from "../../tracker/data";
import { checkState } from "../../tracker/state";
import type { MapInfo, TrackerData } from "../../tracker/types";
import CheckList, { stateColors } from "./CheckList";

// Every world map is drawn on the same 1002x668
const MAP_WIDTH = 1002;
const MAP_HEIGHT = 668;
const MAX_ZOOM = 8;
// Checks closer than this on screen share a marker, like the quests of a quest hub
const CLUSTER_RADIUS = 50;
// A press that moves further than this pans the map rather than clicking it
const DRAG_THRESHOLD = 4;

interface Marker {
	/** Where on the map, from 0 to 1. */
	u: number;
	v: number;
	checks: Check[];
	/** A child map's checks, shown on its parent: hovering and clicking it go to the map underneath. */
	aggregate: boolean;
}

type Rect = [number, number, number, number];

/** A map the pointer goes to from the one shown, with where its highlight lies on that one. */
interface Target {
	map: MapInfo;
	rect: Rect;
}

/** A marker's colour: green and red split when it holds checks both in and out of logic. */
export function markerBackground(checks: Check[]) {
	const states = new Set(checks.map((check) => checkState(check.id)));
	if (states.has("available") && states.has("blocked"))
		return `conic-gradient(${stateColors.available} 0 50%, ${stateColors.blocked} 0)`;
	for (const state of ["available", "blocked", "unknown"] as const) if (states.has(state)) return stateColors[state];
	return stateColors.checked;
}

/**
 * A world map as the game shows it: the pointer lights up the maps it opens, left click opens one and right
 * click goes back up. Dragging pans, the wheel zooms.
 */
export default function MapView(props: {
	data: TrackerData;
	mapId: number;
	onNavigate: (id: number) => void;
	/** The checks to show, the ones placed on a map among them. */
	checks: Check[];
}) {
	let container!: HTMLDivElement;
	const maps = createMemo(() => new Map(props.data.maps.map((map) => [map.id, map])));
	const ancestors = createMemo(() => {
		const result = new Map<number, Set<number>>();
		for (const map of props.data.maps) {
			const chain = new Set<number>();
			for (let current: MapInfo | undefined = map; current; current = maps().get(current.parent ?? NaN))
				chain.add(current.id);
			result.set(map.id, chain);
		}
		return result;
	});

	const [size, setSize] = createSignal({ width: 0, height: 0 });
	const [zoom, setZoom] = createSignal(1);
	const [offset, setOffset] = createSignal<[number, number] | null>(null);
	const [hovered, setHovered] = createSignal<MapInfo | null>(null);
	const [popup, setPopup] = createSignal<Marker | null>(null);

	const map = () => maps().get(props.mapId)!;
	const children = createMemo(() =>
		props.data.maps.filter((m) => m.parent === props.mapId && (m.highlight || m.hit)),
	);

	/** The maps the pointer goes to from this one that light up, with where their highlight is on it. */
	const targets = createMemo<Target[]>(() => {
		const result: Target[] = children()
			.filter((child) => child.highlight)
			.map((child) => ({ map: child, rect: child.highlight!.rect }));
		// A zone's map is its rectangle on the continent, which shows the zones around it: they're placed as
		// they are there
		const view = map();
		if (view.kind !== "zone" || !view.highlight) return result;
		const [x, y, w, h] = view.highlight.rect;
		for (const zone of props.data.maps) {
			if (zone.parent !== view.parent || zone.kind !== "zone" || !zone.highlight || zone.id === view.id) continue;
			const [zx, zy, zw, zh] = zone.highlight.rect;
			result.push({ map: zone, rect: [(zx - x) / w, (zy - y) / h, zw / w, zh / h] });
		}
		return result;
	});
	const fit = () => Math.min(size().width / MAP_WIDTH, size().height / MAP_HEIGHT) || 1;
	const scale = () => fit() * zoom();

	/** Keeps the map over the view, centred along an axis it doesn't fill. */
	const clamp = ([x, y]: [number, number], s = scale()): [number, number] => {
		const width = MAP_WIDTH * s;
		const height = MAP_HEIGHT * s;
		const view = size();
		return [
			width <= view.width ? (view.width - width) / 2 : Math.min(0, Math.max(view.width - width, x)),
			height <= view.height ? (view.height - height) / 2 : Math.min(0, Math.max(view.height - height, y)),
		];
	};
	const position = () => clamp(offset() ?? [0, 0]);

	createEffect(
		on(
			() => props.mapId,
			() => {
				setZoom(1);
				setOffset(null);
				setHovered(null);
				setPopup(null);
			},
		),
	);

	// How much the cities' highlights light up each of their pixels, from 0 to 255, to tell which is under the
	// pointer: they have no hit rectangle, and their highlights add light
	const masks = new Map<string, { width: number; height: number; strengths: Uint8Array }>();
	createEffect(() => {
		for (const child of children()) {
			if (child.kind !== "city" || !child.highlight) continue;
			const url = asset(child.highlight.image);
			if (masks.has(url)) continue;
			const image = new Image();
			image.onload = () => {
				const { naturalWidth: width, naturalHeight: height } = image;
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext("2d", { willReadFrequently: true })!;
				context.drawImage(image, 0, 0);
				const pixels = context.getImageData(0, 0, width, height).data;
				const strengths = new Uint8Array(width * height);
				let max = 1;
				for (let i = 0; i < strengths.length; i++) {
					strengths[i] = Math.max(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
					max = Math.max(max, strengths[i]);
				}
				for (let i = 0; i < strengths.length; i++) strengths[i] = (strengths[i] * 255) / max;
				masks.set(url, { width, height, strengths });
			};
			image.src = url;
		}
	});

	/**
	 * The map under a point: a child map by its hit rectangle, or a city by the highlight that's strongest
	 * there; else a zone, from the continent's grid as the game finds it. None where it's the zone shown.
	 */
	const targetAt = (u: number, v: number) => {
		let best: MapInfo | null = null;
		let strongest = 24;
		for (const child of children()) {
			if (!child.hit && child.kind !== "city") continue;
			const [x, y, w, h] = child.hit ?? child.highlight!.rect;
			const lu = (u - x) / w;
			const lv = (v - y) / h;
			if (lu < 0 || lu >= 1 || lv < 0 || lv >= 1) continue;
			if (child.hit) return child;
			const mask = masks.get(asset(child.highlight!.image));
			const strength = mask
				? mask.strengths[Math.floor(lv * mask.height) * mask.width + Math.floor(lu * mask.width)]
				: 0;
			if (strength > strongest) {
				strongest = strength;
				best = child;
			}
		}
		if (best) return best;

		// A zone's map is its rectangle on the continent
		const view = map();
		const continent = view.kind === "zone" ? maps().get(view.parent!) : view;
		const grid = continent?.zones;
		if (!grid || (view.kind === "zone" && !view.highlight)) return null;
		const [vx, vy, vw, vh] = view.kind === "zone" ? view.highlight!.rect : [0, 0, 1, 1];
		const [x, y, w, h] = grid.rect;
		const rows = grid.cells.length / grid.columns;
		const column = Math.floor(((vx + u * vw - x) / w) * grid.columns);
		const row = Math.floor(((vy + v * vh - y) / h) * rows);
		if (column < 0 || column >= grid.columns || row < 0 || row >= rows) return null;
		const id = grid.cells[row * grid.columns + column];
		return id && id !== props.mapId ? (maps().get(id) ?? null) : null;
	};

	/** Where a point of the map is on screen. */
	const toScreen = (u: number, v: number): [number, number] => {
		const [x, y] = position();
		return [x + u * MAP_WIDTH * scale(), y + v * MAP_HEIGHT * scale()];
	};

	/** Where a child map's checks gather on this one: a zone's middle, or the middle of where it opens from. */
	const anchor = (child: MapInfo): [number, number] => {
		if (child.highlight && child.center && (child.kind === "zone" || child.kind === "city")) {
			const [x, y, w, h] = child.highlight.rect;
			return [x + child.center[0] * w, y + child.center[1] * h];
		}
		const [x, y, w, h] = child.hit ?? child.highlight!.rect;
		return [x + w / 2, y + h / 2];
	};

	// On the map rather than on screen, as panning moves them all alike
	const markers = createMemo<Marker[]>(() => {
		const view = map();
		const placed = props.checks.filter((check) => check.spot);
		if (view.kind === "zone" || view.kind === "city") {
			const own = new Set(props.data.maps.filter((m) => m.parent === view.id).map((m) => m.id)).add(view.id);
			const radius = CLUSTER_RADIUS / scale();
			const result: Marker[] = [];
			for (const check of placed) {
				if (!own.has(check.spot!.map)) continue;
				const point = projectSpot(maps(), check.spot!, view);
				if (!point) continue;
				const [u, v] = point;
				const near = result.find(
					(marker) => Math.hypot((marker.u - u) * MAP_WIDTH, (marker.v - v) * MAP_HEIGHT) < radius,
				);
				if (near) near.checks.push(check);
				else result.push({ u, v, checks: [check], aggregate: false });
			}
			return result;
		}
		return children()
			.map((child) => {
				const [u, v] = anchor(child);
				const checks = placed.filter((check) => ancestors().get(check.spot!.map)?.has(child.id));
				return { u, v, checks, aggregate: true };
			})
			.filter((marker) => marker.checks.length > 0);
	});

	onMount(() => {
		const observer = new ResizeObserver(() =>
			setSize({ width: container.clientWidth, height: container.clientHeight }),
		);
		observer.observe(container);
		onCleanup(() => observer.disconnect());

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const bounds = container.getBoundingClientRect();
			const sx = event.clientX - bounds.left;
			const sy = event.clientY - bounds.top;
			const [x, y] = position();
			const u = (sx - x) / scale();
			const v = (sy - y) / scale();
			const next = Math.min(MAX_ZOOM, Math.max(1, zoom() * (event.deltaY < 0 ? 1.25 : 0.8)));
			const nextScale = fit() * next;
			setZoom(next);
			setOffset(clamp([sx - u * nextScale, sy - v * nextScale], nextScale));
			setPopup(null);
		};
		container.addEventListener("wheel", onWheel, { passive: false });
		onCleanup(() => container.removeEventListener("wheel", onWheel));

		const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPopup(null);
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
	});

	let drag: { x: number; y: number; start: [number, number]; moved: boolean } | null = null;

	const pointer = (event: PointerEvent) => {
		const bounds = container.getBoundingClientRect();
		return [event.clientX - bounds.left, event.clientY - bounds.top] as const;
	};

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		const [sx, sy] = pointer(event);
		drag = { x: sx, y: sy, start: position(), moved: false };
		container.setPointerCapture(event.pointerId);
		setPopup(null);
	};

	const onPointerMove = (event: PointerEvent) => {
		const [sx, sy] = pointer(event);
		if (drag) {
			if (!drag.moved && Math.hypot(sx - drag.x, sy - drag.y) > DRAG_THRESHOLD) drag.moved = true;
			if (drag.moved) {
				setOffset(clamp([drag.start[0] + sx - drag.x, drag.start[1] + sy - drag.y]));
				return;
			}
		}
		const [x, y] = position();
		setHovered(targetAt((sx - x) / (MAP_WIDTH * scale()), (sy - y) / (MAP_HEIGHT * scale())));
	};

	const onPointerUp = () => {
		const clicked = drag && !drag.moved;
		drag = null;
		const child = hovered();
		if (clicked && child) props.onNavigate(child.id);
	};

	const onContextMenu = (event: MouseEvent) => {
		event.preventDefault();
		const parent = map().parent;
		if (parent != null) props.onNavigate(parent);
	};

	const [popupHeight, setPopupHeight] = createSignal(0);
	const measurePopup = (element: HTMLElement) => {
		const observer = new ResizeObserver(() => setPopupHeight(element.offsetHeight));
		observer.observe(element);
		onCleanup(() => observer.disconnect());
	};

	/** Beside its marker, on the left when there's no room on the right, and moved up as much as it needs. */
	const popupPosition = () => {
		const [x, y] = toScreen(popup()!.u, popup()!.v);
		const width = 320;
		const left = x + 14 + width <= size().width - 8 ? x + 14 : Math.max(8, x - 14 - width);
		const top = Math.max(8, Math.min(y - 20, size().height - popupHeight() - 8));
		return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
	};

	return (
		<div
			ref={container}
			class="relative h-full w-full touch-none overflow-hidden bg-black"
			classList={{ "cursor-pointer": hovered() != null }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerLeave={() => setHovered(null)}
			onContextMenu={onContextMenu}
		>
			<div
				class="absolute top-0 left-0 origin-top-left overflow-hidden"
				style={{
					width: `${MAP_WIDTH}px`,
					height: `${MAP_HEIGHT}px`,
					transform: `translate(${position()[0]}px, ${position()[1]}px) scale(${scale()})`,
				}}
			>
				<img src={asset(map().image)} alt="" draggable={false} class="absolute inset-0 size-full" />
				{/* Every highlight is there from the start, loaded, and only shown while hovered. A zone around
				    the one shown can be wider than the map, which Tailwind's max-width would squeeze it into. */}
				<For each={targets()}>
					{(target) => (
						<img
							src={asset(target.map.highlight!.image)}
							alt=""
							draggable={false}
							class="pointer-events-none absolute max-w-none"
							classList={{ hidden: hovered()?.id !== target.map.id }}
							style={{
								left: `${target.rect[0] * MAP_WIDTH}px`,
								top: `${target.rect[1] * MAP_HEIGHT}px`,
								width: `${target.rect[2] * MAP_WIDTH}px`,
								height: `${target.rect[3] * MAP_HEIGHT}px`,
								"mix-blend-mode": target.map.highlight!.blend === "add" ? "plus-lighter" : "normal",
							}}
						/>
					)}
				</For>
			</div>

			<Index each={markers()}>
				{(marker) => {
					const pending = () => marker().checks.filter((check) => checkState(check.id) !== "checked").length;
					const screen = () => toScreen(marker().u, marker().v);
					return (
						<button
							type="button"
							class="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-black/80 text-[10px] leading-none font-bold text-black shadow-[0_0_4px_rgba(0,0,0,0.8)]"
							classList={{
								"pointer-events-none size-6": marker().aggregate,
								"size-[18px] hover:scale-125": !marker().aggregate,
							}}
							style={{
								left: `${screen()[0]}px`,
								top: `${screen()[1]}px`,
								background: markerBackground(marker().checks),
							}}
							title={marker().checks.length === 1 ? marker().checks[0].name : undefined}
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => setPopup(marker())}
						>
							<Show when={pending() > 1 || marker().aggregate}>{pending() || ""}</Show>
						</button>
					);
				}}
			</Index>

			<Show when={hovered()}>
				<div class="pointer-events-none absolute inset-x-0 top-10 text-center text-2xl font-semibold text-gold-soft [text-shadow:0_2px_4px_#000,0_0_2px_#000]">
					{hovered()?.name}
				</div>
			</Show>

			<Show when={popup()}>
				{(marker) => (
					<div
						ref={measurePopup}
						class="absolute z-10 flex max-h-[300px] flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-2/95 shadow-2xl backdrop-blur"
						style={popupPosition()}
						onPointerDown={(event) => event.stopPropagation()}
						onPointerMove={(event) => event.stopPropagation()}
						onContextMenu={(event) => event.stopPropagation()}
						onWheel={(event) => event.stopPropagation()}
					>
						<div class="min-h-0 overflow-y-auto">
							<CheckList checks={marker().checks} />
						</div>
					</div>
				)}
			</Show>
		</div>
	);
}
