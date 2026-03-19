import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../generator", () => ({
	generate: vi.fn().mockResolvedValue(undefined),
}));

import { generate } from "../generator";
import { contentTreeGeneratorPlugin } from "../plugin";

const baseOpts = {
	docsDir: "src/docs",
	outFile: "src/tree.gen.ts",
	urlPrefix: "/docs",
	treeName: "Docs",
};

describe("contentTreeGeneratorPlugin", () => {
	beforeEach(() => {
		(generate as ReturnType<typeof vi.fn>).mockClear();
	});

	it("returns a plugin with the correct name", () => {
		const plugin = contentTreeGeneratorPlugin(baseOpts);
		expect(plugin.name).toBe("content-tree");
	});

	it("enforces pre ordering", () => {
		const plugin = contentTreeGeneratorPlugin(baseOpts);
		expect(plugin.enforce).toBe("pre");
	});

	it("has buildStart, configResolved, and configureServer hooks", () => {
		const plugin = contentTreeGeneratorPlugin(baseOpts);
		expect(plugin.buildStart).toBeTypeOf("function");
		expect(plugin.configResolved).toBeTypeOf("function");
		expect(plugin.configureServer).toBeTypeOf("function");
	});

	it("resolves paths relative to vite root via configResolved", async () => {
		const plugin = contentTreeGeneratorPlugin(baseOpts);

		(plugin.configResolved as (config: { root: string }) => void)({ root: "/my/project" });
		await (plugin.buildStart as () => Promise<void>).call({});

		expect(generate).toHaveBeenCalledWith(
			expect.objectContaining({
				docsDir: resolve("/my/project", "src/docs"),
				outFile: resolve("/my/project", "src/tree.gen.ts"),
			}),
		);
	});

	describe("configureServer watcher", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		function setupServer(opts = baseOpts) {
			const plugin = contentTreeGeneratorPlugin(opts);
			(plugin.configResolved as (config: { root: string }) => void)({ root: "/project" });

			const handlers: Record<string, (file: string) => void> = {};
			const httpHandlers: Record<string, () => void> = {};
			const mockServer = {
				config: { logger: { error: vi.fn() } },
				watcher: {
					on: (event: string, handler: (file: string) => void) => {
						handlers[event] = handler;
					},
				},
				moduleGraph: {
					getModuleById: vi.fn().mockReturnValue(null),
					invalidateModule: vi.fn(),
				},
				hot: {
					send: vi.fn(),
				},
				httpServer: {
					on: (event: string, handler: () => void) => {
						httpHandlers[event] = handler;
					},
				},
			};

			(plugin.configureServer as unknown as (server: typeof mockServer) => void)(mockServer);
			(generate as ReturnType<typeof vi.fn>).mockClear();
			return { handlers, httpHandlers, mockServer };
		}

		it("regenerates on matching page file changes", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs/guides/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);
		});

		it("regenerates on matching meta file changes", async () => {
			const { handlers } = setupServer();

			handlers.add(resolve("/project/src/docs/guides/_meta.json"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);
		});

		it("regenerates on matching file unlinks", async () => {
			const { handlers } = setupServer();

			handlers.unlink(resolve("/project/src/docs/guides/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);
		});

		it("ignores files outside docsDir", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/other/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});

		it("ignores non-matching filenames", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs/guides/other.ts"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});

		it("does not match files with similar suffixes", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs/my_meta.json"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});

		it("ignores files in sibling directories with similar prefix", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs-extra/guides/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});

		it("debounces rapid changes", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs/guides/index.mdx"));
			handlers.change(resolve("/project/src/docs/about/index.mdx"));
			handlers.change(resolve("/project/src/docs/faq/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);
		});

		it("invalidates module graph and sends full-reload after generation", async () => {
			const mockModule = { id: "test" };
			const { handlers, mockServer } = setupServer();
			mockServer.moduleGraph.getModuleById.mockReturnValue(mockModule);

			handlers.change(resolve("/project/src/docs/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(mockServer.moduleGraph.invalidateModule).toHaveBeenCalledWith(mockModule);
			expect(mockServer.hot.send).toHaveBeenCalledWith({ type: "full-reload" });
		});

		it("logs errors from failed generation", async () => {
			(generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("scan failed"));
			const { handlers, mockServer } = setupServer();

			handlers.change(resolve("/project/src/docs/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(mockServer.config.logger.error).toHaveBeenCalledWith(
				expect.stringContaining("scan failed"),
			);
		});

		it("queues pending regeneration when change arrives during in-flight generation", async () => {
			let resolveGenerate!: () => void;
			(generate as ReturnType<typeof vi.fn>).mockImplementationOnce(
				() =>
					new Promise<void>((r) => {
						resolveGenerate = r;
					}),
			);

			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/docs/guides/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);

			handlers.change(resolve("/project/src/docs/about/index.mdx"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(1);

			resolveGenerate();
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).toHaveBeenCalledTimes(2);
		});

		it("ignores changes to the output file itself", async () => {
			const { handlers } = setupServer();

			handlers.change(resolve("/project/src/tree.gen.ts"));
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});

		it("clears debounce timer on server close", async () => {
			const { handlers, httpHandlers } = setupServer();

			handlers.change(resolve("/project/src/docs/guides/index.mdx"));

			httpHandlers.close();
			await vi.advanceTimersByTimeAsync(200);

			expect(generate).not.toHaveBeenCalled();
		});
	});
});
