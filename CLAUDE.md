# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian plugin that displays recently added vault files in the left sidebar, sorted by creation time. The compiled output (`main.js`) is what Obsidian loads directly from this directory.

## Commands

```bash
pnpm dev      # watch mode with inline sourcemaps
pnpm build    # type-check + minified production bundle
```

Package manager: **pnpm** (v10). No test runner is configured.

The build compiles `main.ts` → `main.js` (CommonJS, ES2018 target) via esbuild. External modules (obsidian, electron, @codemirror/\*, @lezer/\*) are never bundled.

## Architecture

Everything lives in `main.ts` (single file, ~340 lines) with three classes:

- **`RecentlyAddedPlugin`** — plugin lifecycle, registers the view and command (`recently-added-open`), listens to vault events (`create`, `delete`, `rename`) and workspace `file-open` to trigger redraws.
- **`RecentlyAddedView`** — `ItemView` rendered in the left sidebar. Scans all vault files, applies regex exclusion filters and age cutoff, sorts newest-first, and renders an Obsidian-style file list with click/drag/hover/context-menu interactions.
- **`RecentlyAddedSettingTab`** — settings UI for `maxLength` (default 50), `maxAgeDays` (default 30), and `omittedPaths` (array of regex strings).

Settings are persisted via Obsidian's `loadData`/`saveData` and merged with defaults on load.

## Obsidian Plugin Conventions

- `manifest.json` declares the plugin ID (`recently-added-obsidian`), min app version, and mobile compatibility.
- To test locally: copy/symlink `main.js`, `styles.css`, and `manifest.json` into an Obsidian vault's `.obsidian/plugins/recently-added-obsidian/` directory, then reload plugins.
- Obsidian API is imported from the `obsidian` package (dev dependency pointing to a GitHub archive). Never bundle it.
