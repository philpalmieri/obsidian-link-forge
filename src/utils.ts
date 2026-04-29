/**
 * Pure utility functions for Link Forge.
 * Extracted for testability — no Obsidian API dependencies.
 */

export interface ParsedWikilink {
	/** The full original match text, e.g. [[People/Name#Heading|Alias]] */
	original: string;
	/** The link path without heading or alias, e.g. People/Name */
	linkPath: string;
	/** Optional heading fragment, e.g. Heading */
	heading: string | undefined;
	/** Optional display alias, e.g. Alias */
	alias: string | undefined;
}

/**
 * Extract all wikilinks from a line of text.
 */
export function extractWikilinks(lineText: string): ParsedWikilink[] {
	const wikiLinkRegex = /\[\[([^\]|#]+?)(?:#([^\]|]*?))?(?:\|([^\]]*?))?\]\]/g;
	const results: ParsedWikilink[] = [];
	let match: RegExpExecArray | null;

	while ((match = wikiLinkRegex.exec(lineText)) !== null) {
		const linkPath = match[1]?.trim();
		if (!linkPath) continue;

		results.push({
			original: match[0],
			linkPath,
			heading: match[2] || undefined,
			alias: match[3] || undefined,
		});
	}

	return results;
}

/**
 * Check if a link path targets one of the configured watched folders.
 * If watchedFolders is empty, all links match.
 */
export function isInWatchedFolder(linkPath: string, watchedFolders: string[]): boolean {
	if (watchedFolders.length === 0) return true;

	return watchedFolders.some(folder => {
		const normalized = folder.endsWith('/') ? folder : folder + '/';
		return linkPath.startsWith(normalized);
	});
}

/**
 * Build a shortened wikilink string from a basename, preserving heading and alias.
 * Returns null if the shortened form would be identical to the original.
 */
export function buildShortenedLink(
	original: string,
	basename: string,
	heading: string | undefined,
	alias: string | undefined
): string | null {
	let shortened: string;

	if (alias) {
		shortened = heading
			? `[[${basename}#${heading}|${alias}]]`
			: `[[${basename}|${alias}]]`;
	} else if (heading) {
		shortened = `[[${basename}#${heading}]]`;
	} else {
		shortened = `[[${basename}]]`;
	}

	return shortened === original ? null : shortened;
}

/**
 * Apply link shortenings to a line of text.
 * Returns the modified line, or the original if no changes were made.
 */
export function applyLinkShortenings(
	lineText: string,
	replacements: { original: string; shortened: string }[]
): string {
	let result = lineText;
	for (const { original, shortened } of replacements) {
		result = result.replace(original, shortened);
	}
	return result;
}

/**
 * Check if a link path has a non-markdown file extension.
 * Returns true if the path ends with an extension that is NOT .md,
 * indicating it targets a non-markdown file (e.g., .pdf, .png).
 * Uses a max extension length of 5 to avoid false positives from
 * dots in filenames (e.g., "Dr. Smith").
 */
export function hasNonMarkdownExtension(linkPath: string): boolean {
	const lastDot = linkPath.lastIndexOf('.');
	if (lastDot === -1) return false;
	const ext = linkPath.substring(lastDot + 1).toLowerCase();
	return ext !== 'md' && ext.length > 0 && ext.length <= 5;
}
