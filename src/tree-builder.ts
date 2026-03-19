import { DEFAULT_ORDER, INDEX_SUFFIX } from "./config";
import type {
	ContentTreeDirectoryNode,
	ContentTreeNode,
	ContentTreePageNode,
	DirectoryLabelResolver,
	DirectoryMeta,
	ScannedPage,
	WithoutOrder,
} from "./types";

/** Pre-computed index that groups pages by parent path for O(1) lookups during tree building. */
export interface PageIndex {
	directChildren: Map<string, ScannedPage[]>;
	subDirNames: Map<string, Set<string>>;
}

/** Context threaded through recursive `buildChildren` calls. */
export interface BuildContext {
	pageIndex: PageIndex;
	metas: Map<string, DirectoryMeta>;
	urlPrefix: string;
	resolveDirectoryLabel: DirectoryLabelResolver;
}

/**
 * Pre-groups pages into a lookup index so `buildChildren` can avoid
 * re-filtering the full page list at every recursion level.
 *
 * @param pages - All scanned pages (root page with key="" is excluded from grouping)
 * @returns A `PageIndex` with O(1) lookups by parent path
 */
export function buildPageIndex(pages: ScannedPage[]): PageIndex {
	const directChildren = new Map<string, ScannedPage[]>();
	const subDirNames = new Map<string, Set<string>>();

	for (const page of pages) {
		if (page.key === "") continue;

		const parentPath = page.segments.slice(0, -1).join("/") || "";

		let children = directChildren.get(parentPath);
		if (!children) {
			children = [];
			directChildren.set(parentPath, children);
		}
		children.push(page);

		// For segments ["a", "b", "c"]:
		//   depth=0 → ancestor="" registers "a" as subdir of root
		//   depth=1 → ancestor="a" registers "b" as subdir of "a"
		//   (depth=2 is excluded — "c" is the leaf's own dir, registered via directChildren)
		for (let depth = 0; depth < page.segments.length - 1; depth++) {
			const ancestor = page.segments.slice(0, depth).join("/") || "";
			let dirs = subDirNames.get(ancestor);
			if (!dirs) {
				dirs = new Set();
				subDirNames.set(ancestor, dirs);
			}
			dirs.add(page.segments[depth]);
		}
	}

	return { directChildren, subDirNames };
}

/**
 * Default directory label resolver.
 * Falls back through: `extra.module` → `meta.name` → throws.
 */
export const defaultResolveDirectoryLabel: DirectoryLabelResolver = (
	dirName,
	meta,
	indexPage,
) => {
	const mod = indexPage?.extra?.module as string | undefined;
	if (mod) return mod;
	if (meta.name) return meta.name;
	throw new Error(
		`Directory "${dirName}" has no label. Set { "name": "..." } in its _meta.json.`,
	);
};

/**
 * Recursively builds a sorted array of child nodes for a given parent path.
 *
 * @param parentPath - The key prefix for the parent (empty string for root)
 * @param ctx - Build context with shared configuration and pre-scanned metadata
 * @returns Sorted array of tree nodes
 */
export function buildChildren(parentPath: string, ctx: BuildContext): ContentTreeNode[] {
	const parentSegments = parentPath ? parentPath.split("/") : [];

	const directPages = ctx.pageIndex.directChildren.get(parentPath) ?? [];
	const dirNames = ctx.pageIndex.subDirNames.get(parentPath) ?? new Set<string>();

	const pageBySegment = new Map<string, ScannedPage>();
	for (const page of directPages) {
		pageBySegment.set(page.segments[parentSegments.length], page);
	}

	const results: ContentTreeNode[] = [];

	for (const page of directPages) {
		const lastSegment = page.segments[page.segments.length - 1];
		if (dirNames.has(lastSegment)) continue;

		const pageNode: ContentTreePageNode = {
			type: "page",
			name: page.nav ?? page.title,
			id: page.key,
			url: `${ctx.urlPrefix}/${page.key}`,
			order: page.order,
		};
		results.push(pageNode);
	}

	for (const dirName of dirNames) {
		const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName;
		const indexPage = pageBySegment.get(dirName);

		const meta = ctx.metas.get(dirPath) ?? {};
		const children = buildChildren(dirPath, ctx);

		if (children.length === 0 && !indexPage) continue;

		const dirLabel = ctx.resolveDirectoryLabel(dirName, meta, indexPage);

		const directory: ContentTreeDirectoryNode = {
			type: "directory",
			name: dirLabel,
			id: dirPath,
			children,
			order: indexPage?.order ?? meta.order ?? DEFAULT_ORDER,
		};

		if (indexPage) {
			directory.index = {
				type: "page",
				name: indexPage.nav ?? indexPage.title,
				url: `${ctx.urlPrefix}/${indexPage.key}`,
				id: `${indexPage.key}${INDEX_SUFFIX}`,
			};
		}

		results.push(directory);
	}

	results.sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		return a.name.localeCompare(b.name);
	});

	return results;
}

/**
 * Recursively removes the `order` field from a tree node and all its descendants.
 * The `order` field is only used for sorting and is not needed in the final output.
 */
export function stripOrder(node: ContentTreeNode): WithoutOrder {
	if (node.type === "page") {
		const { order: _, ...rest } = node;
		return rest;
	}
	const { order: _, children, index, ...rest } = node;
	return {
		...rest,
		children: children.map(stripOrder),
		...(index && { index }),
	};
}
