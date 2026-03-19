import { describe, expect, it } from "vitest";
import type { BuildContext } from "../tree-builder";
import {
	buildChildren,
	buildPageIndex,
	defaultResolveDirectoryLabel,
	stripOrder,
} from "../tree-builder";
import type {
	ContentTreeDirectoryNode,
	ContentTreeNode,
	DirectoryMeta,
	ScannedPage,
} from "../types";

function mockPage(overrides: Partial<ScannedPage> & { key: string }): ScannedPage {
	return {
		title: overrides.key || "Untitled",
		order: 999,
		file: `${overrides.key}/index.mdx`,
		segments: overrides.key ? overrides.key.split("/") : [],
		...overrides,
	};
}

function makeCtx(
	pageIndex: ReturnType<typeof buildPageIndex>,
	overrides?: Partial<BuildContext>,
): BuildContext {
	return {
		pageIndex,
		metas: new Map(),
		urlPrefix: "/docs",
		acronyms: new Set(),
		resolveDirectoryLabel: defaultResolveDirectoryLabel,
		...overrides,
	};
}

describe("buildChildren", () => {
	it("builds page nodes for direct children", () => {
		const pages = [
			mockPage({ key: "", title: "Home" }),
			mockPage({ key: "about", title: "About", order: 1 }),
			mockPage({ key: "contact", title: "Contact", order: 2 }),
		];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children).toHaveLength(2);
		const first = children[0];
		expect(first.type).toBe("page");
		expect(first.name).toBe("About");
		expect(first.id).toBe("about");
		if (first.type !== "page") throw new Error("expected page");
		expect(first.url).toBe("/docs/about");
		expect(children[1].name).toBe("Contact");
	});

	it("creates directory nodes with index pages", () => {
		const pages = [
			mockPage({ key: "guides", title: "Guides", order: 1 }),
			mockPage({ key: "guides/setup", title: "Setup", order: 1 }),
		];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children).toHaveLength(1);
		const dir = children[0];
		expect(dir.type).toBe("directory");
		expect(dir.id).toBe("guides");
		if (dir.type !== "directory") throw new Error("expected directory");
		expect(dir.index).toBeDefined();
		expect(dir.index?.name).toBe("Guides");
		expect(dir.index?.url).toBe("/docs/guides");
		expect(dir.children).toHaveLength(1);
		expect(dir.children[0].name).toBe("Setup");
	});

	it("sorts by order then alphabetically", () => {
		const pages = [
			mockPage({ key: "zebra", title: "Zebra", order: 1 }),
			mockPage({ key: "alpha", title: "Alpha", order: 1 }),
			mockPage({ key: "first", title: "First", order: 0 }),
		];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children.map((c) => c.name)).toEqual(["First", "Alpha", "Zebra"]);
	});

	it("uses module from extra for directory label via default resolver", () => {
		const pages = [
			mockPage({
				key: "ses",
				title: "SES",
				order: 1,
				extra: { module: "SES Inbox" },
			}),
			mockPage({ key: "ses/config", title: "Config", order: 1 }),
		];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children[0].name).toBe("SES Inbox");
	});

	it("reads directory label from pre-scanned metas", () => {
		const pages = [mockPage({ key: "guides/intro", title: "Intro", order: 1 })];
		const pageIndex = buildPageIndex(pages);
		const metas = new Map<string, DirectoryMeta>([["guides", { name: "User Guides" }]]);

		const children = buildChildren("", makeCtx(pageIndex, { metas }));

		expect(children[0].name).toBe("User Guides");
	});

	it("uses nav field for page name when available", () => {
		const pages = [mockPage({ key: "long-title", title: "Very Long Title", nav: "Short" })];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children[0].name).toBe("Short");
	});

	it("prunes empty directories without index pages", () => {
		const pages = [
			mockPage({ key: "", title: "Home" }),
			mockPage({ key: "guides", title: "Guides", order: 1 }),
		];
		const pageIndex = buildPageIndex(pages);
		pageIndex.subDirNames.set("", new Set(["guides", "empty-dir"]));

		const children = buildChildren("", makeCtx(pageIndex));

		expect(children).toHaveLength(1);
		expect(children.find((c) => c.id === "empty-dir")).toBeUndefined();
	});

	it("uses custom resolveDirectoryLabel", () => {
		const pages = [
			mockPage({ key: "guides", title: "Guides", order: 1 }),
			mockPage({ key: "guides/setup", title: "Setup", order: 1 }),
		];
		const pageIndex = buildPageIndex(pages);

		const children = buildChildren(
			"",
			makeCtx(pageIndex, {
				resolveDirectoryLabel: (dirName) => `PREFIX-${dirName}`,
			}),
		);

		expect(children[0].name).toBe("PREFIX-guides");
	});
});

describe("stripOrder", () => {
	it("removes order from a page node", () => {
		const node: ContentTreeNode = {
			type: "page",
			name: "Test",
			id: "test",
			url: "/docs/test",
			order: 5,
		};

		const result = stripOrder(node);
		expect(result).toEqual({
			type: "page",
			name: "Test",
			id: "test",
			url: "/docs/test",
		});
		expect("order" in result).toBe(false);
	});

	it("recursively removes order from children", () => {
		const node: ContentTreeNode = {
			type: "directory",
			name: "Parent",
			id: "parent",
			order: 1,
			children: [{ type: "page", name: "Child", id: "child", url: "/child", order: 2 }],
		};

		const result = stripOrder(node);
		expect("order" in result).toBe(false);
		if (result.type !== "directory") throw new Error("expected directory");
		expect(result.children).toHaveLength(1);
		const firstChild = result.children[0];
		expect(firstChild).toBeDefined();
		expect("order" in firstChild).toBe(false);
	});

	it("preserves index without order field", () => {
		const node: ContentTreeDirectoryNode = {
			type: "directory",
			name: "Dir",
			id: "dir",
			children: [],
			order: 1,
			index: { type: "page", name: "Index", url: "/dir", id: "dir/index" },
		};

		const result = stripOrder(node);
		if (result.type !== "directory") throw new Error("expected directory");
		expect(result.index).toEqual({
			type: "page",
			name: "Index",
			url: "/dir",
			id: "dir/index",
		});
	});
});
