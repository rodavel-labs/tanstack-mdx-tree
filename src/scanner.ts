import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { DEFAULT_ORDER } from "./config";
import type { DirectoryMeta, FrontmatterMapper, FrontmatterResult, ScannedPage } from "./types";

const BASE_FIELDS = new Set(["title", "description", "order", "nav"]);
const META_BASE_FIELDS = new Set(["name", "order"]);

/**
 * Default frontmatter mapper that extracts base fields and passes
 * all remaining fields through as `extra`.
 */
export const defaultMapFrontmatter: FrontmatterMapper = (raw) => {
	const result: FrontmatterResult = {
		title: typeof raw.title === "string" ? raw.title : "",
		description: typeof raw.description === "string" ? raw.description : undefined,
		nav: typeof raw.nav === "string" ? raw.nav : undefined,
		order: typeof raw.order === "number" ? raw.order : undefined,
	};

	const extra: Record<string, unknown> = {};
	let hasExtra = false;
	for (const key of Object.keys(raw)) {
		if (!BASE_FIELDS.has(key)) {
			extra[key] = raw[key];
			hasExtra = true;
		}
	}
	if (hasExtra) {
		result.extra = extra;
	}

	return result;
};

/**
 * Reads and parses a directory metadata file (e.g., `_meta.json`).
 *
 * @param docsDir - Root content directory path
 * @param dirPath - Relative path to the directory within docsDir
 * @param metaFile - Name of the metadata file to look for
 * @returns Parsed metadata or an empty object if the file doesn't exist
 */
export async function readDirectoryMeta(
	docsDir: string,
	dirPath: string,
	metaFile: string,
): Promise<DirectoryMeta> {
	const metaPath = join(docsDir, dirPath, metaFile);
	const resolvedMeta = resolve(metaPath);
	const resolvedRoot = resolve(docsDir);

	if (!resolvedMeta.startsWith(`${resolvedRoot}/`) && resolvedMeta !== resolvedRoot) {
		throw new Error(`Metadata path escapes content root: ${metaPath}`);
	}

	let content: string;
	try {
		content = await readFile(resolvedMeta, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw new Error(`Failed to read metadata file: ${metaPath}`, { cause: err });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (err) {
		throw new Error(`Failed to parse metadata file: ${metaPath}`, { cause: err });
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		const actual = Array.isArray(parsed) ? "array" : typeof parsed;
		throw new Error(`Metadata file must contain a JSON object, got ${actual}: ${metaPath}`);
	}

	const obj = parsed as Record<string, unknown>;
	const meta: DirectoryMeta = {};
	if (typeof obj.name === "string") meta.name = obj.name;
	if (typeof obj.order === "number" && Number.isFinite(obj.order)) meta.order = obj.order;

	const extra: Record<string, unknown> = {};
	let hasExtra = false;
	for (const key of Object.keys(obj)) {
		if (!META_BASE_FIELDS.has(key)) {
			extra[key] = obj[key];
			hasExtra = true;
		}
	}
	if (hasExtra) {
		meta.extra = extra;
	}

	return meta;
}

/**
 * Recursively scans a content directory for page files, extracts frontmatter,
 * and returns an array of scanned pages.
 *
 * @param docsDir - Root content directory to scan
 * @param pageFile - Filename to match as a page entry (e.g., `"index.mdx"`)
 * @param mapFrontmatter - Callback to extract fields from raw frontmatter data
 * @returns Array of scanned pages with extracted metadata
 */
export async function scanPages(
	docsDir: string,
	pageFile: string,
	mapFrontmatter: FrontmatterMapper = defaultMapFrontmatter,
): Promise<ScannedPage[]> {
	const pages: ScannedPage[] = [];

	async function walk(dir: string) {
		const entries = await readdir(dir, { withFileTypes: true });
		const subdirs: string[] = [];

		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				subdirs.push(full);
			} else if (entry.name === pageFile) {
				const relPath = relative(docsDir, full).replace(/\\/g, "/");
				const dirRel = dirname(relPath);
				const key = dirRel === "." ? "" : dirRel;
				const segments = key ? key.split("/") : [];

				let content: string;
				try {
					content = await readFile(full, "utf-8");
				} catch (err) {
					throw new Error(`Failed to read page file: ${full}`, { cause: err });
				}

				let data: Record<string, unknown>;
				try {
					data = matter(content).data as Record<string, unknown>;
				} catch (err) {
					throw new Error(`Failed to parse frontmatter in: ${full}`, { cause: err });
				}

				const result = mapFrontmatter(data, relPath);

				pages.push({
					key,
					title: result.title,
					description: result.description,
					nav: result.nav,
					order: result.order ?? DEFAULT_ORDER,
					file: relPath,
					segments,
					extra: result.extra,
				});
			}
		}

		await Promise.all(subdirs.map(walk));
	}

	await walk(docsDir);
	return pages;
}

/**
 * Resolves the `extra.module` field for each page by looking up its module-root ancestor.
 * Pages inherit the module from the root page of their first path segment.
 *
 * This is the default `enrichPages` implementation.
 */
export function resolveModules(pages: ScannedPage[], pageByKey: Map<string, ScannedPage>): void {
	for (const page of pages) {
		if (page.extra?.module) continue;
		if (page.segments.length === 0) continue;

		const moduleRoot = pageByKey.get(page.segments[0]);
		const mod = moduleRoot?.extra?.module;
		if (mod) {
			page.extra = { ...page.extra, module: mod };
		}
	}
}
