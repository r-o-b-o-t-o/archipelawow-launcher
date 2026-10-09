/* @refresh reload */
import { HashRouter, Route } from "@solidjs/router";
import { render } from "solid-js/web";

import App from "./App";
import "./index.css";
import { initTooltips } from "./lib/tooltips";
import Dashboard from "./pages/Dashboard";
import PlayerOptions from "./pages/PlayerOptions";
import Settings from "./pages/Settings";
import Setup from "./pages/Setup";
import Tracker from "./pages/Tracker";

initTooltips();

// Hash routing: the launcher serves the UI as static files, with nothing to fall back to index.html
render(
	() => (
		<HashRouter root={App}>
			<Route path="/" component={Dashboard} />
			<Route path="/setup" component={Setup} />
			<Route path="/player-options" component={PlayerOptions} />
			<Route path="/tracker" component={Tracker} />
			<Route path="/settings" component={Settings} />
		</HashRouter>
	),
	document.getElementById("root")!,
);
