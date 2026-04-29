# Release Process Instructions

## Version Locations (ALL must be updated together)

When bumping a version, update ALL of the following:

1. **`manifest.json`** → `"version": "X.Y.Z"` (Obsidian reads this)
2. **`package.json`** → `"version": "X.Y.Z"` (npm/build tooling reads this)
3. **`versions.json`** → add `"X.Y.Z": "<minAppVersion>"` entry (Obsidian uses this for compatibility checking)

The `minAppVersion` in `manifest.json` and `versions.json` should only change if the plugin starts using newer Obsidian APIs.

## Description Locations (ALL must match)

The plugin description must be identical across:

1. `manifest.json` → `"description"`
2. `package.json` → `"description"`
3. GitHub repo "About" description (Settings → General → Description)
4. `community-plugins.json` entry in `obsidianmd/obsidian-releases` (only if re-submitting)

## Cutting a Release

1. Create a feature/fix branch off main
2. Bump version in `manifest.json`, `package.json`, and `versions.json`
3. Merge to main via PR (CI + Copilot review must pass)
4. Tag on main: `git tag X.Y.Z` (NO `v` prefix — Obsidian requires bare semver)
5. Push the tag: `git push origin X.Y.Z`
6. The release workflow automatically: validates versions, lints, typechecks, tests, builds, attests with Sigstore, and creates the GitHub Release

## Tag Format

- Tags MUST NOT have a `v` prefix (e.g. `1.0.2` not `v1.0.2`)
- Release name is set to match the tag exactly
- The release workflow validates strict semver format: `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`

## Obsidian Community Plugins Registry

Our plugin is listed in `obsidianmd/obsidian-releases` via PR #12412 (fork: `philpalmieri/obsidian-releases`, branch: `add-link-forge`).

For future updates, the registry entry only needs updating if:
- The plugin description changes
- The plugin ID changes (it shouldn't)
- The plugin is being removed

Normal version bumps do NOT require touching the registry — Obsidian reads the latest release from our GitHub repo directly.

## Immutable Releases

This repo uses immutable releases. Once a release is published, it cannot be patched. If a fix is needed, bump the version and cut a new release.

## Build Attestation

Every release includes Sigstore build provenance attestation. Users can verify:
```bash
gh attestation verify main.js --repo philpalmieri/obsidian-link-forge
```

## Branch Protection

- PRs required for all changes to main
- CI must pass (lint, typecheck, test, build)
- Copilot code review required (as status check, re-runnable if it flakes)
- Repo admin can bypass with `--admin` flag if needed
- No human approval required (solo maintainer)
