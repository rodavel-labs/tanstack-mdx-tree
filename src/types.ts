/** Index page associated with a directory node. */
export interface ContentTreeIndexNode {
	type: "page";
	name: string;
	url: string;
	id: string;
}

/** A page node in the content tree. */
export interface ContentTreePageNode {
	type: "page";
	name: string;
	id: string;
	url: string;
	order: number;
}

/** A directory node in the content tree. */
export interface ContentTreeDirectoryNode {
	type: "directory";
	name: string;
	id: string;
	children: ContentTreeNode[];
	index?: ContentTreeIndexNode;
	order: number;
}

/** A node in the content tree — either a page or a directory. */
export type ContentTreeNode = ContentTreePageNode | ContentTreeDirectoryNode;

/** Recursive type that strips the `order` field from a tree node and its descendants. */
export type WithoutOrder =
	| { type: "page"; name: string; id: string; url: string }
	| {
			type: "directory";
			name: string;
			id: string;
			children: WithoutOrder[];
			index?: ContentTreeIndexNode;
	  };

/** The final shape of a content tree after order fields are stripped. */
export type ContentTree = WithoutOrder;

/** Default page entry shape produced by the built-in `mapPageEntry`. */
export interface ContentPage {
	title: string;
	description?: string;
	file: string;
	[key: string]: unknown;
}

/** Minimal frontmatter fields used by the core scanning logic. */
export interface BaseFrontmatter {
	title: string;
	description?: string;
	order?: number;
	nav?: string;
}

/** What a `mapFrontmatter` callback must return. */
export interface FrontmatterResult {
	title: string;
	description?: string;
	nav?: string;
	order?: number;
	/** Arbitrary extra fields that flow into `ScannedPage.extra`. */
	extra?: Record<string, unknown>;
}

/** A parsed content page with extracted metadata. */
export interface ScannedPage {
	key: string;
	title: string;
	description?: string;
	nav?: string;
	order: number;
	file: string;
	segments: string[];
	extra?: Record<string, unknown>;
}

/** Metadata read from a directory's `_meta.json` file. */
export interface DirectoryMeta {
	name?: string;
	order?: number;
	/** Arbitrary extra fields from the metadata file that aren't part of the base schema. */
	extra?: Record<string, unknown>;
}

/** Configuration for the content tree generator. */
export interface ContentTreeGeneratorOptions {
	/** Path to the content directory to scan. */
	docsDir: string;
	/** Path where the generated TypeScript file is written. */
	outFile: string;

	/**
	 * TanStack Router routes directory used to derive the URL prefix.
	 * The URL prefix is computed as the relative path from `routesDir` to `docsDir`.
	 * @default "src/routes"
	 */
	routesDir?: string;

	/** Filename for directory metadata. @default "_meta.json" */
	metaFile?: string;
	/** Filename to match as a page entry. @default "index.mdx" */
	pageFile?: string;

	/**
	 * Called after scanning and before tree building, allowing consumers to
	 * mutate pages in place (e.g., inherit fields from ancestors).
	 *
	 * @param pages - The full array of scanned pages.
	 * @param pageByKey - A Map keyed by page key for O(1) lookups.
	 */
	enrichPages?: (pages: ScannedPage[], pageByKey: Map<string, ScannedPage>) => void;
}
