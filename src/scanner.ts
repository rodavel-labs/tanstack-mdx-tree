import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { DEFAULT_ORDER } from "./config";
import type { DirectoryMeta, FrontmatterResult, ScannedPage } from "./types";

const BASE_FIELDS = new Set(["title", "description", "order", "nav"]);
const META_BASE_FIELDS = new Set(["name", "order"]);

/**
 * Default frontmatter mapper that extracts base fields and passes
 * all remaining fields through as `extra`.
 */
export const defaultMapFrontmatter = (raw: Record<string, unknown>): FrontmatterResult => {
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
 * @returns Array of scanned pages with extracted metadata
 */
export async function scanPages(docsDir: string, pageFile: string): Promise<ScannedPage[]> {
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

				const result = defaultMapFrontmatter(data);

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
	// this is needed otherwise contentTree.gen.ts will generate different output on each run due to filesystem order differences
	pages.sort((a, b) => a.key.localeCompare(b.key));
	return pages;
}
