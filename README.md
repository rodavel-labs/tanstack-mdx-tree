# @rodavel/vite-plugin-content-tree

Vite plugin that scans content directories, extracts frontmatter, and generates a typed navigation tree as a TypeScript file.

## Install

```bash
npm install @rodavel/vite-plugin-content-tree
```

## Usage

```ts
// vite.config.ts
import { contentTreeGeneratorPlugin } from "@rodavel/vite-plugin-content-tree";

export default defineConfig({
  plugins: [
    contentTreeGeneratorPlugin({
      docsDir: "src/content/docs",
      outFile: "src/generated/docs-tree.gen.ts",
      urlPrefix: "/docs",
      treeName: "Documentation",
    }),
  ],
});
```

The plugin scans `docsDir` for page files (default `index.mdx`) with YAML frontmatter, builds a nested navigation tree, and writes it to `outFile` as a TypeScript module. During dev it watches for changes and regenerates automatically.

## Options

### Required

| Option | Type | Description |
| --- | --- | --- |
| `docsDir` | `string` | Path to the content directory to scan |
| `outFile` | `string` | Path where the generated TypeScript file is written |
| `urlPrefix` | `string` | URL prefix prepended to page paths (e.g., `"/docs"`) |
| `treeName` | `string` | Display name for the root tree object |

### Optional

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `root` | `{ name, id }` | — | Wraps top-level children in a synthetic root directory node |
| `treeType` | `{ from, name }` | — | Type to import for the tree variable in the generated file |
| `pageType` | `{ from, name }` | — | Type to import for the pages Map values in the generated file |
| `pagesExportName` | `string` | `"pages"` | Export name for the pages `Map` |
| `treeExportName` | `string` | `"docsTree"` | Export name for the tree object |
| `acronyms` | `string[] \| Set<string>` | — | Words to fully uppercase when humanizing directory names (e.g., `["api", "sdk"]`) |
| `metaFile` | `string` | `"_meta.json"` | Filename for directory metadata |
| `pageFile` | `string` | `"index.mdx"` | Filename to match as a page entry |
| `mapFrontmatter` | `FrontmatterMapper` | built-in | Custom frontmatter mapper |
| `enrichPages` | `PageEnricher` | no-op | Post-processes pages after scanning |
| `mapPageEntry` | `PageEntryMapper` | built-in | Customizes the per-page entry shape in the generated output |
| `resolveDirectoryLabel` | `DirectoryLabelResolver` | built-in | Resolves the display label for directory nodes |

## Compatibility

- Vite 5+
- Node.js 18+

## License

[MIT](LICENSE)
