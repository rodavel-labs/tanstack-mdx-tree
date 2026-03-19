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

/**
 * Resolves the display label for a directory node in the content tree.
 *
 * @param dirName - The raw directory name (slug)
 * @param meta - Parsed metadata from the directory's `_meta.json` file
 * @param indexPage - The index page for this directory, if one exists
 * @param acronyms - Set of words to fully uppercase when humanizing
 * @returns The display label for the directory node
 */
export type DirectoryLabelResolver = (
	dirName: string,
	meta: DirectoryMeta,
	indexPage: ScannedPage | undefined,
	acronyms: Set<string>,
) => string;

/**
 * Maps raw frontmatter data to the fields used by the content tree.
 *
 * @param raw - The parsed frontmatter object from gray-matter
 * @param file - The relative file path (for error messages or conditional logic)
 * @returns The extracted frontmatter fields
 */
export type FrontmatterMapper = (raw: Record<string, unknown>, file: string) => FrontmatterResult;

/**
 * Post-processes scanned pages before tree building.
 * Use this to enrich pages with computed fields (e.g., resolving module names from ancestors).
 */
export type PageEnricher = (pages: ScannedPage[], pageByKey: Map<string, ScannedPage>) => void;

/**
 * Maps a scanned page to the object shape written to the generated output file.
 * The returned object is serialized as a value in the `pages` Map.
 */
export type PageEntryMapper = (page: ScannedPage) => Record<string, unknown>;

/** Configuration for the content tree generator. */
export interface ContentTreeGeneratorOptions {
	/** Path to the content directory to scan. */
	docsDir: string;
	/** Path where the generated TypeScript file is written. */
	outFile: string;
	/** URL prefix prepended to page paths (e.g., `"/docs"`). */
	urlPrefix: string;
	/** Display name for the root tree object (e.g., `"Docs"`). */
	treeName: string;

	/** If provided, wraps top-level children in a synthetic root directory node. */
	root?: { name: string; id: string };
	/** Type to import in the generated file for the tree variable. */
	treeType?: { from: string; name: string };
	/** Type to import in the generated file for the pages Map values. */
	pageType?: { from: string; name: string };

	/** Export name for the pages Map. @default "pages" */
	pagesExportName?: string;
	/** Export name for the tree object. @default "docsTree" */
	treeExportName?: string;

	/** Acronyms to uppercase when humanizing directory names. */
	acronyms?: string[] | Set<string>;
	/** Filename for directory metadata. @default "_meta.json" */
	metaFile?: string;
	/** Filename to match as a page entry. @default "index.mdx" */
	pageFile?: string;

	/** Custom frontmatter mapper. The default handles `BaseFrontmatter` fields plus `module` in `extra`. */
	mapFrontmatter?: FrontmatterMapper;
	/**
	 * Post-processes pages after scanning.
	 * @default no-op — pass `resolveModules` to enable module resolution from ancestors.
	 */
	enrichPages?: PageEnricher;
	/** Customizes the per-page entry shape in the generated output. */
	mapPageEntry?: PageEntryMapper;
	/**
	 * Resolves the display label for directory nodes.
	 * @default Falls back to `extra.module` → `meta.name` → `humanize(dirName)`.
	 */
	resolveDirectoryLabel?: DirectoryLabelResolver;
}
