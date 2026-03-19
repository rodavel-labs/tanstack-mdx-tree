import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_META_FILE, DEFAULT_ORDER, DEFAULT_PAGE_FILE, INDEX_SUFFIX } from "./config";
import { readDirectoryMeta, scanPages } from "./scanner";
import {
	buildChildren,
	buildPageIndex,
	defaultResolveDirectoryLabel,
	stripOrder,
} from "./tree-builder";
import type {
	ContentTreeDirectoryNode,
	ContentTreeGeneratorOptions,
	DirectoryMeta,
	PageEntryMapper,
	ScannedPage,
	WithoutOrder,
} from "./types";

const SAFE_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/;
const SAFE_IMPORT_PATH =
	/^(?:\.\.?\/[\w@._$/-]+|@[\w-]+\/[\w._-]+(?:\/[\w._-]+)*|[a-zA-Z][\w._-]*(?:\/[\w._-]+)*)$/;

/** Normalizes the `acronyms` option to a `Set<string>`. */
function normalizeAcronyms(acronyms: string[] | Set<string> | undefined): Set<string> {
	if (acronyms instanceof Set) return acronyms;
	return new Set(acronyms ?? []);
}

/** Default page entry mapper — produces `{ title, description?, file }` plus any extra fields. Base fields always win over extra. */
const defaultMapPageEntry: PageEntryMapper = (page) => {
	const entry: Record<string, unknown> = { ...page.extra };
	entry.title = page.title;
	if (page.description) entry.description = page.description;
	entry.file = page.file;
	return entry;
};

export interface GenerateDataResult {
	pages: ScannedPage[];
	tree: WithoutOrder;
}

/**
 * Pre-reads all directory metadata files for the directories discovered
 * during page indexing, returning a map for O(1) lookups during tree building.
 */
async function preloadMetas(
	docsDir: string,
	metaFile: string,
	subDirNames: Map<string, Set<string>>,
): Promise<Map<string, DirectoryMeta>> {
	const dirPaths = new Set<string>();
	for (const [parentPath, dirs] of subDirNames) {
		for (const dir of dirs) {
			dirPaths.add(parentPath ? `${parentPath}/${dir}` : dir);
		}
	}

	const metas = new Map<string, DirectoryMeta>();
	await Promise.all(
		[...dirPaths].map(async (dirPath) => {
			const meta = await readDirectoryMeta(docsDir, dirPath, metaFile);
			if (meta.name !== undefined || meta.order !== undefined || meta.extra !== undefined) {
				metas.set(dirPath, meta);
			}
		}),
	);

	return metas;
}

/**
 * Runs the full scan → enrich → build pipeline and returns the raw data
 * without writing any files.
 *
 * @param opts - Generator configuration
 * @returns The scanned pages and the built tree (with order fields stripped)
 */
export async function generateData(opts: ContentTreeGeneratorOptions): Promise<GenerateDataResult> {
	const metaFile = opts.metaFile ?? DEFAULT_META_FILE;
	const pageFile = opts.pageFile ?? DEFAULT_PAGE_FILE;
	const acronyms = normalizeAcronyms(opts.acronyms);

	const pages = await scanPages(opts.docsDir, pageFile, opts.mapFrontmatter);
	const pageByKey = new Map(pages.map((p) => [p.key, p]));

	const enrich = opts.enrichPages ?? (() => {});
	enrich(pages, pageByKey);

	const resolveLabel = opts.resolveDirectoryLabel ?? defaultResolveDirectoryLabel;
	const pageIndex = buildPageIndex(pages);
	const metas = await preloadMetas(opts.docsDir, metaFile, pageIndex.subDirNames);
	const ctx = {
		pageIndex,
		metas,
		urlPrefix: opts.urlPrefix,
		acronyms,
		resolveDirectoryLabel: resolveLabel,
	};
	const topChildren = buildChildren("", ctx);

	let tree: WithoutOrder;
	const rootPage = pageByKey.get("");

	if (opts.root) {
		const rootDirectory: ContentTreeDirectoryNode = {
			type: "directory",
			name: opts.root.name,
			id: opts.root.id,
			children: [],
			order: DEFAULT_ORDER,
		};
		if (rootPage) {
			rootDirectory.index = {
				type: "page",
				name: rootPage.nav ?? rootPage.title,
				url: opts.urlPrefix,
				id: `${opts.root.id}${INDEX_SUFFIX}`,
			};
		}

		const treeChildren = [stripOrder(rootDirectory), ...topChildren.map(stripOrder)];
		tree = { type: "directory", name: opts.treeName, id: opts.treeName, children: treeChildren };
	} else {
		tree = {
			type: "directory",
			name: opts.treeName,
			id: opts.treeName,
			children: topChildren.map(stripOrder),
		};
		if (rootPage) {
			tree.index = {
				type: "page",
				name: rootPage.nav ?? rootPage.title,
				url: opts.urlPrefix,
				id: `${opts.treeName}${INDEX_SUFFIX}`,
			};
		}
	}

	return { pages, tree };
}

/**
 * Writes the generated data to a TypeScript file using the configured template.
 *
 * @param opts - Generator configuration (controls export names, type imports, page entry shape)
 * @param data - The data to serialize (from `generateData`)
 */
export async function writeOutput(
	opts: ContentTreeGeneratorOptions,
	data: GenerateDataResult,
): Promise<void> {
	const { treeType, pageType } = opts;
	const pagesExport = opts.pagesExportName ?? "pages";
	const treeExport = opts.treeExportName ?? "docsTree";
	const mapEntry = opts.mapPageEntry ?? defaultMapPageEntry;

	if (!SAFE_IDENTIFIER.test(pagesExport)) {
		throw new Error(`Invalid pagesExportName: "${pagesExport}" — must be a valid JS identifier`);
	}
	if (!SAFE_IDENTIFIER.test(treeExport)) {
		throw new Error(`Invalid treeExportName: "${treeExport}" — must be a valid JS identifier`);
	}

	if (treeType) {
		if (!SAFE_IDENTIFIER.test(treeType.name)) {
			throw new Error(`Invalid treeType.name: "${treeType.name}" — must be a valid JS identifier`);
		}
		if (!SAFE_IMPORT_PATH.test(treeType.from)) {
			throw new Error(`Invalid treeType.from: "${treeType.from}" — must be a valid import path`);
		}
	}

	if (pageType) {
		if (!SAFE_IDENTIFIER.test(pageType.name)) {
			throw new Error(`Invalid pageType.name: "${pageType.name}" — must be a valid JS identifier`);
		}
		if (!SAFE_IMPORT_PATH.test(pageType.from)) {
			throw new Error(`Invalid pageType.from: "${pageType.from}" — must be a valid import path`);
		}
	}

	const pagesEntries: [string, Record<string, unknown>][] = data.pages.map((p) => [
		p.key,
		mapEntry(p),
	]);

	const pagesJson = JSON.stringify(pagesEntries, null, "\t");
	const treeJson = JSON.stringify(data.tree, null, "\t");

	const lines: string[] = [
		"// This file is auto-generated by the content-tree plugin. Do not edit.",
	];

	if (treeType && pageType && treeType.from === pageType.from) {
		lines.push(`import type { ${pageType.name}, ${treeType.name} } from "${treeType.from}";`);
	} else {
		if (pageType) {
			lines.push(`import type { ${pageType.name} } from "${pageType.from}";`);
		}
		if (treeType) {
			lines.push(`import type { ${treeType.name} } from "${treeType.from}";`);
		}
	}

	const pagesValueType = pageType ? pageType.name : "Record<string, unknown>";
	lines.push("");
	lines.push(`export const ${pagesExport} = new Map<string, ${pagesValueType}>(${pagesJson});`);

	lines.push("");
	if (treeType) {
		lines.push(`export const ${treeExport}: ${treeType.name} = ${treeJson};`);
	} else {
		lines.push(`export const ${treeExport} = ${treeJson};`);
	}

	const outDir = dirname(opts.outFile);
	await mkdir(outDir, { recursive: true });

	const tmpFile = join(outDir, `.${randomUUID()}.content-tree.tmp`);
	try {
		await writeFile(tmpFile, `${lines.join("\n")}\n`);
		await rename(tmpFile, opts.outFile);
	} catch (err) {
		try {
			await unlink(tmpFile);
		} catch {}
		throw err;
	}
}

/**
 * Generates the content tree data and writes it to the configured output file.
 *
 * @param opts - Generator configuration
 */
export async function generate(opts: ContentTreeGeneratorOptions): Promise<void> {
	const data = await generateData(opts);
	await writeOutput(opts, data);
}
