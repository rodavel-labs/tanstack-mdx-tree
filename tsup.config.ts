import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["esm", "cjs"],
		dts: true,
		clean: true,
		external: ["vite", "gray-matter"],
	},
	{
		entry: ["src/cli.ts"],
		format: ["esm"],
		clean: false,
		external: ["vite", "gray-matter"],
	},
]);
