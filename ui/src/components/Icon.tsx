import { Dynamic } from "solid-js/web";

import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleCheck from "lucide-solid/icons/circle-check";
import CircleX from "lucide-solid/icons/circle-x";
import Copy from "lucide-solid/icons/copy";
import Database from "lucide-solid/icons/database";
import Dice5 from "lucide-solid/icons/dice-5";
import Download from "lucide-solid/icons/download";
import Eraser from "lucide-solid/icons/eraser";
import Eye from "lucide-solid/icons/eye";
import FileText from "lucide-solid/icons/file-text";
import Folder from "lucide-solid/icons/folder";
import Globe from "lucide-solid/icons/globe";
import Info from "lucide-solid/icons/info";
import Key from "lucide-solid/icons/key";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import MapIcon from "lucide-solid/icons/map";
import Package from "lucide-solid/icons/package";
import Play from "lucide-solid/icons/play";
import Plug from "lucide-solid/icons/plug";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Rocket from "lucide-solid/icons/rocket";
import RotateCw from "lucide-solid/icons/rotate-cw";
import Save from "lucide-solid/icons/save";
import Scale from "lucide-solid/icons/scale";
import Server from "lucide-solid/icons/server";
import SlidersVertical from "lucide-solid/icons/sliders-vertical";
import Square from "lucide-solid/icons/square";
import Sword from "lucide-solid/icons/sword";
import Terminal from "lucide-solid/icons/terminal";
import Trash from "lucide-solid/icons/trash";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import Unplug from "lucide-solid/icons/unplug";
import Upload from "lucide-solid/icons/upload";
import UserPlus from "lucide-solid/icons/user-plus";
import WandSparkles from "lucide-solid/icons/wand-sparkles";
import X from "lucide-solid/icons/x";

// Imported one by one: Vite doesn't pre-bundle lucide-solid, so its index would have the dev server load
// every icon
const icons = {
	play: Play,
	stop: Square,
	restart: RotateCw,
	x: X,
	folder: Folder,
	download: Download,
	upload: Upload,
	plus: Plus,
	trash: Trash,
	save: Save,
	dice: Dice5,
	file: FileText,
	sliders: SlidersVertical,
	terminal: Terminal,
	dashboard: LayoutDashboard,
	wand: WandSparkles,
	sword: Sword,
	check: Check,
	alert: TriangleAlert,
	refresh: RefreshCw,
	copy: Copy,
	eye: Eye,
	database: Database,
	userPlus: UserPlus,
	globe: Globe,
	scale: Scale,
	chevronDown: ChevronDown,
	info: Info,
	package: Package,
	eraser: Eraser,
	server: Server,
	rocket: Rocket,
	map: MapIcon,
	chevronRight: ChevronRight,
	circleCheck: CircleCheck,
	circleX: CircleX,
	plug: Plug,
	unplug: Unplug,
	key: Key,
};

export type IconName = keyof typeof icons;

export default function Icon(props: { name: IconName; class?: string }) {
	return <Dynamic component={icons[props.name]} class={props.class ?? "size-4"} />;
}
