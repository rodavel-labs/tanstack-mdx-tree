# @rodavel/tanstack-mdx-tree

Vite plugin that generates typed navigation trees from MDX content colocated with your [TanStack Router](https://tanstack.com/router) routes.

## Why

Colocates MDX documentation with TanStack Router routes following the same file-system conventions. `_meta.json` files provide display names and ordering per directory. The plugin scans the structure and outputs a typed tree and page map for use in navigation components.

## Install

```bash
bun add @rodavel/tanstack-mdx-tree
```

## Usage

```ts
// vite.config.ts
import { contentTreeGeneratorPlugin } from "@rodavel/tanstack-mdx-tree";

export default defineConfig({
  plugins: [
    contentTreeGeneratorPlugin({
      docsDir: "src/routes/docs",
      outFile: "src/generated/docs-tree.gen.ts",
    }),
  ],
});
```

The plugin scans `docsDir` for page files (default `index.mdx`) with YAML frontmatter, builds a nested navigation tree, and writes it to `outFile` as a TypeScript module. It regenerates on every content or metadata change during dev.

### URL prefix derivation

The URL prefix is derived from `docsDir` relative to `routesDir` (default `src/routes`). For example, `src/routes/docs` produces the prefix `/docs`, so a page at `src/routes/docs/guides/index.mdx` gets the URL `/docs/guides`.

### Root tree node

The root tree node name comes from the root `_meta.json` file's `name` field. If no root `_meta.json` exists, the directory name is used (e.g., `docs`).

```text
src/routes/docs/
├── _meta.json          # { "name": "Documentation" }
├── index.mdx           # Root page → becomes tree.index
├── guides/
│   ├── _meta.json      # { "name": "Guides", "order": 1 }
│   ├── index.mdx
│   └── setup/
│       └── index.mdx
└── api/
    ├── _meta.json      # { "name": "API Reference", "order": 2 }
    └── index.mdx
```

### Directory metadata (`_meta.json`)

Each directory can contain a `_meta.json` file to configure its tree node:

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Display label for the directory node |
| `order` | `number` | Sort order (lower values appear first) |

Any additional fields are passed through as `extra` on the `DirectoryMeta` object:

```json
{
  "name": "Guides",
  "order": 1,
  "icon": "book"
}
```

Here `icon` would be available as `extra.icon`.

## Options

### Required

| Option | Type | Description |
| --- | --- | --- |
| `docsDir` | `string` | Path to the content directory to scan |
| `outFile` | `string` | Path where the generated TypeScript file is written |

### Optional

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `routesDir` | `string` | `"src/routes"` | TanStack Router routes directory, used to derive the URL prefix |
| `metaFile` | `string` | `"_meta.json"` | Filename for directory metadata |
| `pageFile` | `string` | `"index.mdx"` | Filename to match as a page entry |

## Compatibility

- Vite 5+
- Node.js 18+

## License

[MIT](LICENSE)
