import { resolve } from "node:path";
import type { Plugin } from "vite";
import { normalizePath } from "vite";
import { DEFAULT_META_FILE, DEFAULT_PAGE_FILE } from "./config";
import { generate } from "./generator";
import type { ContentTreeGeneratorOptions } from "./types";

/**
 * Vite plugin that scans a content directory, extracts frontmatter,
 * and generates a typed navigation tree + page index as a TypeScript file.
 *
 * Runs at build start and watches for changes during dev.
 *
 * @param opts - Generator configuration
 * @returns A Vite plugin
 */
export function contentTreeGeneratorPlugin(opts: ContentTreeGeneratorOptions): Plugin {
	let resolved: ContentTreeGeneratorOptions;
	const metaFile = opts.metaFile ?? DEFAULT_META_FILE;
	const pageFile = opts.pageFile ?? DEFAULT_PAGE_FILE;

	return {
		name: "content-tree",
		enforce: "pre",
		configResolved(config) {
			resolved = {
				...opts,
				docsDir: normalizePath(resolve(config.root, opts.docsDir)),
				outFile: normalizePath(resolve(config.root, opts.outFile)),
			};
		},
		async buildStart() {
			await generate(resolved);
		},
		configureServer(server) {
			let debounceTimer: ReturnType<typeof setTimeout> | undefined;
			let generating = false;
			let pendingRegeneration = false;

			async function regenerate() {
				generating = true;
				try {
					await generate(resolved);
					const mod = server.moduleGraph.getModuleById(resolved.outFile);
					if (mod) {
						server.moduleGraph.invalidateModule(mod);
					}
					server.hot.send({ type: "full-reload" });
				} catch (err) {
					server.config.logger.error(
						`[content-tree] Generation failed: ${err instanceof Error ? err.message : err}`,
					);
				} finally {
					generating = false;
					if (pendingRegeneration) {
						pendingRegeneration = false;
						debounceTimer = setTimeout(regenerate, 150);
					}
				}
			}

			const handler = (file: string) => {
				const normalized = normalizePath(file);
				if (normalized === resolved.outFile) return;
				if (
					normalized.startsWith(`${resolved.docsDir}/`) &&
					(normalized.endsWith(`/${pageFile}`) || normalized.endsWith(`/${metaFile}`))
				) {
					if (generating) {
						pendingRegeneration = true;
						return;
					}
					clearTimeout(debounceTimer);
					debounceTimer = setTimeout(regenerate, 150);
				}
			};

			server.watcher.on("change", handler);
			server.watcher.on("add", handler);
			server.watcher.on("unlink", handler);

			server.httpServer?.on("close", () => {
				clearTimeout(debounceTimer);
			});
		},
	};
}
