import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate, generateData, writeOutput } from "../generator";
import { createMeta, createPage } from "./helpers";

let tempBase: string;
let fixtureDir: string;
let outFile: string;

beforeEach(async () => {
	tempBase = join(tmpdir(), `content-tree-gen-test-${Date.now()}`);
	fixtureDir = join(tempBase, "docs");
	await mkdir(fixtureDir, { recursive: true });
	outFile = join(tempBase, "output.gen.ts");
});

afterEach(async () => {
	await rm(tempBase, { recursive: true, force: true });
});

describe("generateData", () => {
	it("returns pages and tree", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });
		await createMeta(fixtureDir, "about", { name: "About" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		expect(result.pages).toHaveLength(2);
		expect(result.tree.name).toBe("docs");
	});

	it("uses root _meta.json name for tree name", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createMeta(fixtureDir, "", { name: "Documentation" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		expect(result.tree.name).toBe("Documentation");
	});

	it("attaches root page as tree index", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });
		await createMeta(fixtureDir, "about", { name: "About" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		expect(result.tree.index).toBeDefined();
		expect(result.tree.index?.name).toBe("Home");
		expect(result.tree.index?.url).toBe("/docs");
		expect(result.tree.index?.id).toBe("docs/index");
	});

	it("omits tree index when no root page exists", async () => {
		await createPage(fixtureDir, "about/index.mdx", { title: "About", order: 1 });
		await createMeta(fixtureDir, "about", { name: "About" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		if (result.tree.type !== "directory") throw new Error("expected directory");
		expect(result.tree.index).toBeUndefined();
	});

	it("passes non-base frontmatter fields to extra", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home", module: "SES", custom: "val" });

		const result = await generateData({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		expect(result.pages[0].extra).toEqual({ module: "SES", custom: "val" });
	});
});

describe("writeOutput", () => {
	it("imports ContentTree and ContentPage from the package", async () => {
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

		await writeOutput({ docsDir: fixtureDir, outFile }, data);

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain(
			'import type { ContentTree, ContentPage } from "@rodavel/tanstack-mdx-tree"',
		);
		expect(content).toContain("export const docsTree: ContentTree =");
		expect(content).toContain("new Map<string, ContentPage>");
	});

	it("creates output directory if it does not exist", async () => {
		const nestedOut = join(tempBase, "deep", "nested", "output.gen.ts");
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await writeOutput({ docsDir: fixtureDir, outFile: nestedOut }, data);

		const content = await readFile(nestedOut, "utf-8");
		expect(content).toContain("export const docsTree: ContentTree =");
	});

	it("does not leave temp files on successful write", async () => {
		const { readdir } = await import("node:fs/promises");
		const data = {
			pages: [],
			tree: { type: "directory" as const, name: "X", id: "x", children: [] },
		};

		await writeOutput({ docsDir: fixtureDir, outFile }, data);

		const files = await readdir(dirname(outFile));
		const tmpFiles = files.filter((f) => f.includes(".content-tree.tmp"));
		expect(tmpFiles).toHaveLength(0);
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
			routesDir: tempBase,
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
		await createMeta(fixtureDir, "guides", { name: "Guides" });

		await generate({
			docsDir: fixtureDir,
			outFile,
			routesDir: tempBase,
		});

		const content = await readFile(outFile, "utf-8");
		expect(content).toContain("auto-generated");
		expect(content).toContain("ContentTree");
		expect(content).toContain("ContentPage");
		expect(content).toContain("Guides");
		expect(content).toContain("export const pages");
		expect(content).toContain("export const docsTree");
	});
});
