#!/usr/bin/env node
import { resolveConfig } from "vite";

interface ContentTreePluginApi {
	generate: () => Promise<void>;
}

const config = await resolveConfig({}, "build");
const plugin = config.plugins.find((p) => p.name === "content-tree");

if (!plugin?.api) {
	console.error("No content-tree plugin found in your Vite config.");
	process.exit(1);
}

const api = plugin.api as ContentTreePluginApi;
await api.generate();
console.log("Content tree generated.");
