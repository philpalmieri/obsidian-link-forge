# Link Forge

An Obsidian plugin that automatically creates pages from unresolved wikilinks when you move to a new line. No clicks, no modals, no interruptions.

## What it does

You type `[[People/Johnny Appleseed]]` in a note. You press Enter. Link Forge:

1. Detects the unresolved wikilink on the line you just left
2. Creates `People/Johnny Appleseed.md` (and any missing parent folders)
3. Shortens the link to `[[Johnny Appleseed]]` (if it resolves uniquely)

All silently, in the background, while you keep writing.

## Features

- **Line-change detection** — uses CodeMirror 6 `EditorView.updateListener` to process links only when you leave a line (not on every keystroke)
- **Watched folders** — only auto-creates for links targeting configured folders (empty by default = all folders)
- **Folder creation** — automatically creates missing parent directories
- **Templater compatible** — works with Templater's built-in "Trigger on file creation" for automatic folder templates
- **Link shortening** — rewrites `[[Folder/Name]]` to `[[Name]]` when the basename resolves uniquely
- **Heading + alias preservation** — `[[People/Name#Bio|Their Bio]]` shortens to `[[Name#Bio|Their Bio]]`

## Installation

### From Community Plugins (coming soon)

1. Open Obsidian Settings → Community Plugins
2. Search for "Link Forge"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/philpalmieri/obsidian-link-forge/releases/latest)
2. Create folder: `<your-vault>/.obsidian/plugins/link-forge/`
3. Copy the downloaded files into that folder
4. Reload Obsidian and enable "Link Forge" in Settings → Community Plugins

### Verify Release Integrity

Every release is built in GitHub Actions with [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds). You can verify any artifact:

```bash
gh attestation verify main.js --repo philpalmieri/obsidian-link-forge
```

This proves the artifact was built from this repo's source code in CI, not locally tampered with.

## Configuration

Open Settings → Link Forge:

| Setting | Default | Description |
|---------|---------|-------------|
| Enabled | `true` | Global toggle |
| Watched folders | *(empty)* | Only auto-create for links targeting these folders (comma-separated). Empty = all folders. |
| Shorten links after creation | `true` | Rewrite to shortest unique path after file exists |

### Templater compatibility

Link Forge works seamlessly with [Templater](https://github.com/SilentVoid13/Templater). When Link Forge creates a new file, Templater's built-in "Trigger on file creation" feature automatically applies your configured folder templates. No additional configuration needed in Link Forge; just set up your folder templates in Templater's settings as usual.

## How it works

Link Forge registers a [CodeMirror 6 editor extension](https://codemirror.net/docs/ref/#view.EditorView%5EupdateListener) that fires when the cursor moves to a different line. When you leave a line:

1. The plugin extracts all `[[wikilinks]]` from that line
2. Filters to links targeting watched folders
3. Checks each against `metadataCache.getFirstLinkpathDest()` to see if the file exists
4. Creates missing files (with parent folders) via `vault.create()`
5. Optionally triggers Templater and shortens the link text

This means it only activates on line changes (Enter, arrow keys, mouse click to another line), not on every keystroke.

## Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Watch mode (rebuilds on change)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Typecheck
npm run typecheck

# Production build
npm run build
```

### Local testing

Symlink into your vault for live development:

```bash
ln -s /path/to/obsidian-link-forge/main.js <vault>/.obsidian/plugins/link-forge/main.js
ln -s /path/to/obsidian-link-forge/manifest.json <vault>/.obsidian/plugins/link-forge/manifest.json
```

Reload Obsidian with `Cmd+R`. Open the dev console with `Cmd+Option+I` to see `[Link Forge]` log messages.

## Release process

1. Bump version in `manifest.json` and `package.json`
2. Update `versions.json` with the new version → minimum Obsidian version mapping
3. Commit and tag: `git tag v1.0.0`
4. Push: `git push origin main --tags`
5. CI validates, builds, attests, and creates the GitHub Release automatically

## Supply chain security

This plugin uses [GitHub Artifact Attestations](https://github.blog/security/supply-chain-security/introducing-artifact-attestations-now-in-public-beta/) powered by Sigstore to provide verifiable build provenance for every release. This means:

- Every `main.js` in a release is cryptographically tied to a specific source commit
- The build happened in GitHub Actions, not on a developer's local machine
- Anyone can independently verify this with `gh attestation verify`

The Obsidian community plugin ecosystem currently has no verification mechanism for plugin builds. This is a small step toward supply chain security best practices, built by someone who works on these problems professionally.

## License

MIT
