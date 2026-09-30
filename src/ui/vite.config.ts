import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [solid(), tailwindcss()],
	server: {
		port: 5173,
		strictPort: true,
	},
	build: {
		// The UI only ever runs in the WebView2 runtime, an evergreen Chromium
		target: "esnext",
		chunkSizeWarningLimit: 1024,
		// dist/.vite/license.md, published with the launcher's notices
		license: true,
	},
});
