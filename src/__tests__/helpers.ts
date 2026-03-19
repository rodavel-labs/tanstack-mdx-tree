import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Creates a page file with YAML frontmatter in the given fixture directory. */
export async function createPage(
	fixtureDir: string,
	relPath: string,
	frontmatter: Record<string, unknown>,
) {
	const fullPath = join(fixtureDir, relPath);
	await mkdir(dirname(fullPath), { recursive: true });
	const fm = Object.entries(frontmatter)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
		.join("\n");
	await writeFile(fullPath, `---\n${fm}\n---\n\nContent.`);
}

/** Creates a `_meta.json` file in a directory within the fixture directory. */
export async function createMeta(
	fixtureDir: string,
	dirPath: string,
	meta: Record<string, unknown>,
) {
	const fullDir = join(fixtureDir, dirPath);
	await mkdir(fullDir, { recursive: true });
	await writeFile(join(fullDir, "_meta.json"), JSON.stringify(meta));
}
