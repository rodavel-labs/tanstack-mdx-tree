import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate, generateData, writeOutput } from "../generator";
import { resolveModules } from "../scanner";
import { createPage } from "./helpers";

let fixtureDir: string;
let outFile: string;

beforeEach(async () => {
	fixtureDir = join(tmpdir(), `content-tree-gen-test-${Date.now()}`);
	await mkdir(fixtureDir, { recursive: true });
	outFile = join(fixtureDir, "output.gen.ts");
});

afterEach(async () => {
	await rm(fixtureDir, { recursive: true, force: true });
});

describe("generateData", () => {
	it("returns pages and tree", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		expect(result.pages).toHaveLength(2);
		expect(result.tree.name).toBe("Docs");
	});

	it("wraps in root node when root option is provided", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
			root: { name: "Home", id: "home" },
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		const children = result.tree.children;
		expect(children).toBeDefined();
		expect(children[0].name).toBe("Home");
		expect(children[0].id).toBe("home");
	});

	it("attaches root page as tree index when root option is not provided", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		expect(result.tree.index).toBeDefined();
		expect(result.tree.index?.name).toBe("Home");
		expect(result.tree.index?.url).toBe("/docs");
		expect(result.tree.index?.id).toBe("Docs/index");
	});

	it("omits tree index when no root page exists and root option is not provided", async () => {
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		expect(result.tree.index).toBeUndefined();
	});

	it("passes non-base frontmatter fields to extra", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home", module: "SES", custom: "val" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		expect(result.pages[0].extra).toEqual({ module: "SES", custom: "val" });
	});

	it("does not resolve modules by default", async () => {
		await createPage(fixtureDir, "ses/index.mdx", { title: "SES", module: "SES Inbox" });
		await createPage(fixtureDir, "ses/setup/index.mdx", { title: "Setup" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		const setup = result.pages.find((p) => p.key === "ses/setup");
		expect(setup?.extra).toBeUndefined();
	});

	it("resolves modules when enrichPages: resolveModules is passed explicitly", async () => {
		await createPage(fixtureDir, "ses/index.mdx", { title: "SES", module: "SES Inbox" });
		await createPage(fixtureDir, "ses/setup/index.mdx", { title: "Setup" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
			enrichPages: resolveModules,
		});

		const setup = result.pages.find((p) => p.key === "ses/setup");
		expect(setup?.extra).toEqual({ module: "SES Inbox" });
	});

	it("uses a custom resolveDirectoryLabel", async () => {
		await createPage(fixtureDir, "guides/index.mdx", { title: "Guides", order: 1 });
		await createPage(fixtureDir, "guides/setup/index.mdx", { title: "Setup" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
			resolveDirectoryLabel: (dirName) => `Custom: ${dirName}`,
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		const guidesDir = result.tree.children.find((c) => c.id === "guides");
		expect(guidesDir?.name).toBe("Custom: guides");
	});
});

describe("writeOutput", () => {
	it("generates output with type import", async () => {
		const data = {
			pages: [
				{
					key: "about",
					title: "About",
					order: 1,
					file: "about/index.mdx",
					segments: ["about"],
				},
			],
			tree: {
				type: "directory" as const,
				name: "Docs",
				id: "docs",
				children: [],
			},
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/docs",
				treeName: "Docs",
				treeType: { from: "./types", name: "DocsTree" },
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain('import type { DocsTree } from "./types"');
		expect(content).toContain("export const docsTree: DocsTree =");
		expect(content).toContain("export const pages = new Map<string, Record<string, unknown>>");
	});

	it("omits type import when treeType is not set", async () => {
		const data = {
			pages: [],
			tree: {
				type: "directory" as const,
				name: "Docs",
				id: "docs",
				children: [],
			},
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/docs",
				treeName: "Docs",
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).not.toContain("import type");
		expect(content).toContain("export const docsTree =");
	});

	it("uses custom export names", async () => {
		const data = {
			pages: [],
			tree: {
				type: "directory" as const,
				name: "Nav",
				id: "nav",
				children: [],
			},
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/nav",
				treeName: "Nav",
				pagesExportName: "allPages",
				treeExportName: "navTree",
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain("export const allPages =");
		expect(content).toContain("export const navTree =");
	});

	it("rejects invalid pagesExportName", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					pagesExportName: "foo;bar",
				},
				data,
			),
		).rejects.toThrow(/Invalid pagesExportName/);
	});

	it("rejects invalid treeExportName", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					treeExportName: "export default",
				},
				data,
			),
		).rejects.toThrow(/Invalid treeExportName/);
	});

	it("rejects invalid treeType.name", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					treeType: { from: "./types", name: "foo;bar" },
				},
				data,
			),
		).rejects.toThrow(/Invalid treeType\.name/);
	});

	it("rejects invalid treeType.from", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					treeType: { from: '"; exploit()', name: "DocsTree" },
				},
				data,
			),
		).rejects.toThrow(/Invalid treeType\.from/);
	});

	it("creates output directory if it does not exist", async () => {
		const nestedOut = join(fixtureDir, "deep", "nested", "output.gen.ts");
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await writeOutput(
			{ docsDir: fixtureDir, outFile: nestedOut, urlPrefix: "/docs", treeName: "Docs" },
			data,
		);

		const content = await readFile(nestedOut, "utf-8");
		expect(content).toContain("export const docsTree =");
	});

	it("does not leave temp files on successful write", async () => {
		const { readdir } = await import("node:fs/promises");
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await writeOutput({ docsDir: fixtureDir, outFile, urlPrefix: "/docs", treeName: "Docs" }, data);

		const files = await readdir(fixtureDir);
		const tmpFiles = files.filter((f) => f.includes(".content-tree.tmp"));
		expect(tmpFiles).toHaveLength(0);
	});

	it("accepts valid import paths", async () => {
		const validPaths = [
			"./types",
			"../shared/types",
			"@scope/pkg",
			"@scope/pkg/sub",
			"some-package",
		];
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		for (const from of validPaths) {
			await expect(
				writeOutput(
					{
						docsDir: fixtureDir,
						outFile,
						urlPrefix: "/docs",
						treeName: "Docs",
						treeType: { from, name: "T" },
					},
					data,
				),
			).resolves.toBeUndefined();
		}
	});

	it("rejects invalid import paths", async () => {
		const invalidPaths = ["$bad", "path with spaces", "....//x"];
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		for (const from of invalidPaths) {
			await expect(
				writeOutput(
					{
						docsDir: fixtureDir,
						outFile,
						urlPrefix: "/docs",
						treeName: "Docs",
						treeType: { from, name: "T" },
					},
					data,
				),
			).rejects.toThrow(/Invalid treeType\.from/);
		}
	});

	it("generates typed pages Map when pageType is set", async () => {
		const data = {
			pages: [
				{
					key: "about",
					title: "About",
					order: 1,
					file: "about/index.mdx",
					segments: ["about"],
				},
			],
			tree: { type: "directory" as const, name: "Docs", id: "docs", children: [] },
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/docs",
				treeName: "Docs",
				pageType: { from: "./types", name: "PageInfo" },
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain('import type { PageInfo } from "./types"');
		expect(content).toContain("new Map<string, PageInfo>");
	});

	it("combines imports when pageType and treeType share the same module", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "Docs", id: "docs", children: [] },
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/docs",
				treeName: "Docs",
				treeType: { from: "./types", name: "DocsTree" },
				pageType: { from: "./types", name: "PageInfo" },
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain('import type { PageInfo, DocsTree } from "./types"');
		expect(content).not.toMatch(/import type.*\n.*import type/);
	});

	it("emits separate imports when pageType and treeType differ", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "Docs", id: "docs", children: [] },
		};

		await writeOutput(
			{
				docsDir: fixtureDir,
				outFile,
				urlPrefix: "/docs",
				treeName: "Docs",
				treeType: { from: "./tree-types", name: "DocsTree" },
				pageType: { from: "./page-types", name: "PageInfo" },
			},
			data,
		);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain('import type { PageInfo } from "./page-types"');
		expect(content).toContain('import type { DocsTree } from "./tree-types"');
	});

	it("rejects invalid pageType.name", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					pageType: { from: "./types", name: "foo;bar" },
				},
				data,
			),
		).rejects.toThrow(/Invalid pageType\.name/);
	});

	it("rejects invalid pageType.from", async () => {
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await expect(
			writeOutput(
				{
					docsDir: fixtureDir,
					outFile,
					urlPrefix: "/docs",
					treeName: "Docs",
					pageType: { from: '"; exploit()', name: "PageInfo" },
				},
				data,
			),
		).rejects.toThrow(/Invalid pageType\.from/);
	});

	it("base fields win over conflicting extra keys in default mapper", async () => {
		await createPage(fixtureDir, "index.mdx", {
			title: "Real Title",
			description: "Real Desc",
			file: "should-not-appear",
		});

		await generate({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
		});

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain('"Real Title"');
		expect(content).toContain("index.mdx");
		expect(content).not.toContain("should-not-appear");
	});
});

describe("generate", () => {
	it("scans, builds, and writes output end-to-end", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "guides/index.mdx", { title: "Guides", order: 1 });

		await generate({
			docsDir: fixtureDir,
			outFile,
			urlPrefix: "/docs",
			treeName: "Docs",
			root: { name: "Home", id: "home" },
			treeType: { from: "./types", name: "DocsTree" },
		});

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain("auto-generated");
		expect(content).toContain("DocsTree");
		expect(content).toContain("Guides");
		expect(content).toContain("export const pages");
		expect(content).toContain("export const docsTree");
	});
});
