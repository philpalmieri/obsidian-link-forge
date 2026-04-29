# Development Instructions

## Project Overview

Link Forge is an Obsidian plugin that auto-creates pages from unresolved wikilinks when the cursor leaves a line. It uses CodeMirror 6's `EditorView.updateListener` for efficient line-change detection.

## Architecture

- **`src/main.ts`** — Core plugin logic: CM6 listener, queue/processing, file creation, link shortening
- **`src/utils.ts`** — Pure utility functions (no Obsidian deps) for testability
- **`src/settings.ts`** — Settings interface and UI tab
- **`tests/utils.test.ts`** — Unit tests for utility functions (Vitest)

## Key Technical Decisions

### CM6 Line-Change Pattern
- Read the PREVIOUS line from `update.startState.doc` (pre-transaction state), NOT `update.state.doc`
- Capture editor/file context immediately in the listener (before any async work)
- Use a coalescing queue (`pendingWork`) to avoid dropped events without unbounded queues

### Templater Compatibility
- We do NOT call Templater's API directly
- Templater auto-applies folder templates via its own `vault.on("create")` listener when we create an empty `.md` file
- No Templater code exists in this plugin; just document the compatibility

### Link Shortening
- Only shorten if `getFirstLinkpathDest(basename)` resolves uniquely to our file
- Preserve headings and aliases: `[[People/Name#Bio|Display]]` → `[[Name#Bio|Display]]`
- Verify the editor still shows the same file before editing

### Non-Markdown Links
- Skip links with file extensions that aren't `.md` (images, PDFs, etc.)
- Heuristic: if last segment has a dot and extension is 1-5 chars and not "md", skip it

## Build & Test

```bash
npm install --legacy-peer-deps    # Required due to peer dep conflicts
npm run lint                       # ESLint with obsidianmd plugin
npm run typecheck                  # tsc -noEmit -skipLibCheck
npm test                           # Vitest unit tests
npm run build                      # node esbuild.config.mjs production
```

## TypeScript Config

- `moduleResolution: "bundler"` (matches esbuild bundling)
- No `baseUrl` (all imports are relative)
- `skipLibCheck: true` for typecheck (Obsidian types have issues)
- TypeScript 6+ compatible

## Git Workflow

- Always branch off main for features/fixes
- PR back to main; CI + Copilot review must pass
- Squash merge preferred
- Delete branch after merge
- Never commit directly to main

## ESLint Notes

- Uses `eslint-plugin-obsidianmd` which requires `@eslint/json` as a peer dep
- Has `obsidianmd/ui/sentence-case` rule — use `// eslint-disable-next-line` for proper nouns in UI strings
- Config is in `eslint.config.mts`
