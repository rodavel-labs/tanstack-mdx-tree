import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDirectoryMeta, resolveModules, scanPages } from "../scanner";
import type { FrontmatterMapper } from "../types";
import { createPage } from "./helpers";

let fixtureDir: string;

beforeEach(async () => {
	fixtureDir = join(tmpdir(), `content-tree-test-${Date.now()}`);
	await mkdir(fixtureDir, { recursive: true });
});

afterEach(async () => {
	await rm(fixtureDir, { recursive: true, force: true });
});

describe("scanPages", () => {
	it("scans a single root page", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });

		const pages = await scanPages(fixtureDir, "index.mdx");
		expect(pages).toHaveLength(1);
		expect(pages[0].key).toBe("");
		expect(pages[0].title).toBe("Home");
		expect(pages[0].segments).toEqual([]);
	});

	it("scans nested pages", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });
		await createPage(fixtureDir, "guides/index.mdx", { title: "Guides", order: 1 });
		await createPage(fixtureDir, "guides/setup/index.mdx", { title: "Setup", order: 2 });

		const pages = await scanPages(fixtureDir, "index.mdx");
		expect(pages).toHaveLength(3);

		const guides = pages.find((p) => p.key === "guides");
		expect(guides).toBeDefined();
		expect(guides?.title).toBe("Guides");
		expect(guides?.order).toBe(1);
		expect(guides?.segments).toEqual(["guides"]);

		const setup = pages.find((p) => p.key === "guides/setup");
		expect(setup).toBeDefined();
		expect(setup?.order).toBe(2);
	});

	it("applies default order when not specified", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home" });

		const pages = await scanPages(fixtureDir, "index.mdx");
		expect(pages[0].order).toBe(999);
	});

	it("puts module into extra with default mapper", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home", module: "SES" });

		const pages = await scanPages(fixtureDir, "index.mdx");
		expect(pages[0].extra).toEqual({ module: "SES" });
	});

	it("accepts a custom mapFrontmatter callback", async () => {
		await createPage(fixtureDir, "index.mdx", { title: "Home", category: "docs" });

		const mapper: FrontmatterMapper = (raw) => ({
			title: raw.title as string,
			extra: { category: raw.category },
		});

		const pages = await scanPages(fixtureDir, "index.mdx", mapper);
		expect(pages[0].extra).toEqual({ category: "docs" });
	});

	it("throws with file context on malformed frontmatter", async () => {
		const fullPath = join(fixtureDir, "index.mdx");
		await writeFile(fullPath, "---\n: invalid yaml [\n---\n");

		await expect(scanPages(fixtureDir, "index.mdx")).rejects.toThrow(
			/Failed to parse frontmatter in/,
		);
	});
});

describe("readDirectoryMeta", () => {
	it("returns parsed meta when file exists", async () => {
		await writeFile(
			join(fixtureDir, "_meta.json"),
			JSON.stringify({ name: "My Section", order: 5 }),
		);

		const meta = await readDirectoryMeta(fixtureDir, "", "_meta.json");
		expect(meta).toEqual({ name: "My Section", order: 5 });
	});

	it("returns empty object when file does not exist", async () => {
		const meta = await readDirectoryMeta(fixtureDir, "", "_meta.json");
		expect(meta).toEqual({});
	});

	it("throws with context on malformed JSON", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), "not json");

		await expect(readDirectoryMeta(fixtureDir, "", "_meta.json")).rejects.toThrow(
			/Failed to parse metadata file/,
		);
	});

	it("throws when metadata file contains a non-object value", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), '"just a string"');

		await expect(readDirectoryMeta(fixtureDir, "", "_meta.json")).rejects.toThrow(
			/must contain a JSON object, got string/,
		);
	});

	it("throws when metadata file contains an array", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), "[1, 2, 3]");

		await expect(readDirectoryMeta(fixtureDir, "", "_meta.json")).rejects.toThrow(
			/must contain a JSON object, got array/,
		);
	});

	it("throws on empty file content", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), "");

		await expect(readDirectoryMeta(fixtureDir, "", "_meta.json")).rejects.toThrow(
			/Failed to parse metadata file/,
		);
	});

	it("throws when dirPath escapes content root", async () => {
		await expect(readDirectoryMeta(fixtureDir, "../../etc", "passwd")).rejects.toThrow(
			/escapes content root/,
		);
	});

	it("ignores non-string name field", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), JSON.stringify({ name: 123 }));

		const meta = await readDirectoryMeta(fixtureDir, "", "_meta.json");
		expect(meta).toEqual({});
	});

	it("ignores non-number order field", async () => {
		await writeFile(join(fixtureDir, "_meta.json"), JSON.stringify({ order: "bad" }));

		const meta = await readDirectoryMeta(fixtureDir, "", "_meta.json");
		expect(meta).toEqual({});
	});

	it("passes unknown fields through as extra", async () => {
		await writeFile(
			join(fixtureDir, "_meta.json"),
			JSON.stringify({ name: "Valid", icon: "folder", order: 3 }),
		);

		const meta = await readDirectoryMeta(fixtureDir, "", "_meta.json");
		expect(meta).toEqual({ name: "Valid", order: 3, extra: { icon: "folder" } });
	});
});

describe("resolveModules", () => {
	it("resolves module from root ancestor", () => {
		const pages = [
			{
				key: "ses",
				title: "SES",
				order: 1,
				file: "ses/index.mdx",
				segments: ["ses"],
				extra: { module: "SES Inbox" },
			},
			{
				key: "ses/setup",
				title: "Setup",
				order: 2,
				file: "ses/setup/index.mdx",
				segments: ["ses", "setup"],
			},
		];
		const pageByKey = new Map(pages.map((p) => [p.key, p]));

		resolveModules(pages, pageByKey);

		expect(pages[1].extra).toEqual({ module: "SES Inbox" });
	});

	it("does not overwrite existing module", () => {
		const pages = [
			{
				key: "ses",
				title: "SES",
				order: 1,
				file: "ses/index.mdx",
				segments: ["ses"],
				extra: { module: "SES Inbox" },
			},
			{
				key: "ses/setup",
				title: "Setup",
				order: 2,
				file: "ses/setup/index.mdx",
				segments: ["ses", "setup"],
				extra: { module: "Custom" },
			},
		];
		const pageByKey = new Map(pages.map((p) => [p.key, p]));

		resolveModules(pages, pageByKey);

		expect(pages[1].extra?.module).toBe("Custom");
	});
});
