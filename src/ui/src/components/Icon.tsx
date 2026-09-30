import type { JSX } from "solid-js";

// Stroke icons in the style of Lucide (ISC licensed shapes)
const paths = {
	play: () => <polygon points="6 3 20 12 6 21 6 3" />,
	stop: () => <rect x="5" y="5" width="14" height="14" rx="2" />,
	restart: () => (
		<>
			<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
			<path d="M21 3v5h-5" />
		</>
	),
	x: () => (
		<>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</>
	),
	folder: () => (
		<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
	),
	download: () => (
		<>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" x2="12" y1="15" y2="3" />
		</>
	),
	upload: () => (
		<>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" x2="12" y1="3" y2="15" />
		</>
	),
	plus: () => (
		<>
			<path d="M5 12h14" />
			<path d="M12 5v14" />
		</>
	),
	trash: () => (
		<>
			<path d="M3 6h18" />
			<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
			<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
		</>
	),
	save: () => (
		<>
			<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
			<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
			<path d="M7 3v4a1 1 0 0 0 1 1h7" />
		</>
	),
	dice: () => (
		<>
			<rect width="18" height="18" x="3" y="3" rx="3" />
			<path d="M8 8h.01" />
			<path d="M16 8h.01" />
			<path d="M12 12h.01" />
			<path d="M8 16h.01" />
			<path d="M16 16h.01" />
		</>
	),
	file: () => (
		<>
			<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
			<path d="M14 2v4a2 2 0 0 0 2 2h4" />
			<path d="M10 9H8" />
			<path d="M16 13H8" />
			<path d="M16 17H8" />
		</>
	),
	sliders: () => (
		<>
			<line x1="4" x2="4" y1="21" y2="14" />
			<line x1="4" x2="4" y1="10" y2="3" />
			<line x1="12" x2="12" y1="21" y2="12" />
			<line x1="12" x2="12" y1="8" y2="3" />
			<line x1="20" x2="20" y1="21" y2="16" />
			<line x1="20" x2="20" y1="12" y2="3" />
			<line x1="2" x2="6" y1="14" y2="14" />
			<line x1="10" x2="14" y1="8" y2="8" />
			<line x1="18" x2="22" y1="16" y2="16" />
		</>
	),
	terminal: () => (
		<>
			<polyline points="4 17 10 11 4 5" />
			<line x1="12" x2="20" y1="19" y2="19" />
		</>
	),
	dashboard: () => (
		<>
			<rect width="7" height="9" x="3" y="3" rx="1" />
			<rect width="7" height="5" x="14" y="3" rx="1" />
			<rect width="7" height="9" x="14" y="12" rx="1" />
			<rect width="7" height="5" x="3" y="16" rx="1" />
		</>
	),
	wand: () => (
		<>
			<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
			<path d="m14 7 3 3" />
			<path d="M5 6v4" />
			<path d="M19 14v4" />
			<path d="M10 2v2" />
			<path d="M7 8H3" />
			<path d="M21 16h-4" />
			<path d="M11 3H9" />
		</>
	),
	sword: () => (
		<>
			<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
			<line x1="13" x2="19" y1="19" y2="13" />
			<line x1="16" x2="20" y1="16" y2="20" />
			<line x1="19" x2="21" y1="21" y2="19" />
		</>
	),
	check: () => <path d="M20 6 9 17l-5-5" />,
	alert: () => (
		<>
			<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
			<path d="M12 9v4" />
			<path d="M12 17h.01" />
		</>
	),
	external: () => (
		<>
			<path d="M15 3h6v6" />
			<path d="M10 14 21 3" />
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</>
	),
	refresh: () => (
		<>
			<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
			<path d="M21 3v5h-5" />
			<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
			<path d="M8 16H3v5" />
		</>
	),
	copy: () => (
		<>
			<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
			<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
		</>
	),
	eye: () => (
		<>
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	database: () => (
		<>
			<ellipse cx="12" cy="5" rx="9" ry="3" />
			<path d="M3 5V19A9 3 0 0 0 21 19V5" />
			<path d="M3 12A9 3 0 0 0 21 12" />
		</>
	),
	userPlus: () => (
		<>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<line x1="19" x2="19" y1="8" y2="14" />
			<line x1="22" x2="16" y1="11" y2="11" />
		</>
	),
	globe: () => (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
			<path d="M2 12h20" />
		</>
	),
	scale: () => (
		<>
			<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
			<path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
			<path d="M7 21h10" />
			<path d="M12 3v18" />
			<path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
		</>
	),
	chevronDown: () => <path d="m6 9 6 6 6-6" />,
	info: () => (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</>
	),
	package: () => (
		<>
			<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
			<path d="M12 22V12" />
			<path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" />
		</>
	),
	power: () => (
		<>
			<path d="M12 2v10" />
			<path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
		</>
	),
	eraser: () => (
		<>
			<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
			<path d="M22 21H7" />
			<path d="m5 11 9 9" />
		</>
	),
} satisfies Record<string, () => JSX.Element>;

export type IconName = keyof typeof paths;

export default function Icon(props: { name: IconName; class?: string }) {
	return (
		<svg
			class={props.class ?? "size-4"}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{paths[props.name]()}
		</svg>
	);
}
