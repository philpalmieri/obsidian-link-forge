import { describe, it, expect } from 'vitest';
import {
	extractWikilinks,
	isInWatchedFolder,
	buildShortenedLink,
	applyLinkShortenings,
	hasNonMarkdownExtension,
} from '../src/utils';

describe('extractWikilinks', () => {
	it('extracts a simple wikilink', () => {
		const results = extractWikilinks('Check [[People/John Doe]] for info');
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			original: '[[People/John Doe]]',
			linkPath: 'People/John Doe',
			heading: undefined,
			alias: undefined,
		});
	});

	it('extracts wikilink with alias', () => {
		const results = extractWikilinks('See [[People/John Doe|John]]');
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			original: '[[People/John Doe|John]]',
			linkPath: 'People/John Doe',
			heading: undefined,
			alias: 'John',
		});
	});

	it('extracts wikilink with heading', () => {
		const results = extractWikilinks('Ref [[Projects/Alpha#Overview]]');
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			original: '[[Projects/Alpha#Overview]]',
			linkPath: 'Projects/Alpha',
			heading: 'Overview',
			alias: undefined,
		});
	});

	it('extracts wikilink with heading and alias', () => {
		const results = extractWikilinks('See [[People/Name#Bio|Their Bio]]');
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			original: '[[People/Name#Bio|Their Bio]]',
			linkPath: 'People/Name',
			heading: 'Bio',
			alias: 'Their Bio',
		});
	});

	it('extracts multiple wikilinks from one line', () => {
		const results = extractWikilinks('Talk to [[People/Alice]] and [[People/Bob]] about [[Projects/Launch]]');
		expect(results).toHaveLength(3);
		expect(results[0]?.linkPath).toBe('People/Alice');
		expect(results[1]?.linkPath).toBe('People/Bob');
		expect(results[2]?.linkPath).toBe('Projects/Launch');
	});

	it('returns empty array for line with no wikilinks', () => {
		expect(extractWikilinks('Just a normal line of text')).toEqual([]);
	});

	it('returns empty array for empty string', () => {
		expect(extractWikilinks('')).toEqual([]);
	});

	it('handles wikilink with no folder path', () => {
		const results = extractWikilinks('See [[Daily Note]]');
		expect(results).toHaveLength(1);
		expect(results[0]?.linkPath).toBe('Daily Note');
	});

	it('trims whitespace from link path', () => {
		const results = extractWikilinks('See [[ People/Name ]]');
		expect(results).toHaveLength(1);
		expect(results[0]?.linkPath).toBe('People/Name');
	});

	it('handles deeply nested paths', () => {
		const results = extractWikilinks('[[Projects/Ideas/Subgroup/New Thing]]');
		expect(results).toHaveLength(1);
		expect(results[0]?.linkPath).toBe('Projects/Ideas/Subgroup/New Thing');
	});

	it('does not extract incomplete wikilinks', () => {
		expect(extractWikilinks('Start [[People/Name but no close')).toEqual([]);
		expect(extractWikilinks('No open People/Name]]')).toEqual([]);
	});
});

describe('isInWatchedFolder', () => {
	const defaultFolders = ['People/', 'Projects/'];

	it('matches link in watched folder', () => {
		expect(isInWatchedFolder('People/John', defaultFolders)).toBe(true);
		expect(isInWatchedFolder('Projects/Alpha', defaultFolders)).toBe(true);
	});

	it('rejects link not in watched folder', () => {
		expect(isInWatchedFolder('Archive/Old Thing', defaultFolders)).toBe(false);
		expect(isInWatchedFolder('Daily Note', defaultFolders)).toBe(false);
	});

	it('matches nested paths within watched folder', () => {
		expect(isInWatchedFolder('Projects/Ideas/New', defaultFolders)).toBe(true);
	});

	it('returns true for any link when watchedFolders is empty', () => {
		expect(isInWatchedFolder('Anything/At All', [])).toBe(true);
		expect(isInWatchedFolder('Random Note', [])).toBe(true);
	});

	it('normalizes folders without trailing slash', () => {
		expect(isInWatchedFolder('People/Name', ['People'])).toBe(true);
		expect(isInWatchedFolder('Projects/X', ['Projects'])).toBe(true);
	});

	it('does not false-match folder name prefixes', () => {
		expect(isInWatchedFolder('PeopleExtra/Name', defaultFolders)).toBe(false);
	});
});

describe('buildShortenedLink', () => {
	it('shortens a simple path link', () => {
		const result = buildShortenedLink('[[People/John Doe]]', 'John Doe', undefined, undefined);
		expect(result).toBe('[[John Doe]]');
	});

	it('returns null if already shortened', () => {
		const result = buildShortenedLink('[[John Doe]]', 'John Doe', undefined, undefined);
		expect(result).toBeNull();
	});

	it('preserves alias in shortened link', () => {
		const result = buildShortenedLink('[[People/John Doe|Johnny]]', 'John Doe', undefined, 'Johnny');
		expect(result).toBe('[[John Doe|Johnny]]');
	});

	it('preserves heading in shortened link', () => {
		const result = buildShortenedLink('[[Projects/Alpha#Overview]]', 'Alpha', 'Overview', undefined);
		expect(result).toBe('[[Alpha#Overview]]');
	});

	it('preserves both heading and alias', () => {
		const result = buildShortenedLink('[[People/Name#Bio|Their Bio]]', 'Name', 'Bio', 'Their Bio');
		expect(result).toBe('[[Name#Bio|Their Bio]]');
	});
});

describe('applyLinkShortenings', () => {
	it('replaces a single link in text', () => {
		const result = applyLinkShortenings(
			'Talk to [[People/John Doe]] today',
			[{ original: '[[People/John Doe]]', shortened: '[[John Doe]]' }]
		);
		expect(result).toBe('Talk to [[John Doe]] today');
	});

	it('replaces multiple links in text', () => {
		const result = applyLinkShortenings(
			'See [[People/Alice]] and [[People/Bob]]',
			[
				{ original: '[[People/Alice]]', shortened: '[[Alice]]' },
				{ original: '[[People/Bob]]', shortened: '[[Bob]]' },
			]
		);
		expect(result).toBe('See [[Alice]] and [[Bob]]');
	});

	it('returns original text if no replacements', () => {
		const text = 'No links here';
		expect(applyLinkShortenings(text, [])).toBe(text);
	});

	it('handles duplicate links on same line', () => {
		const result = applyLinkShortenings(
			'[[People/Name]] and [[People/Name]]',
			[{ original: '[[People/Name]]', shortened: '[[Name]]' }]
		);
		// String.replace only replaces first occurrence
		expect(result).toBe('[[Name]] and [[People/Name]]');
	});

	it('leaves text intact when replacement target is not found', () => {
		const text = 'See [[People/Alice]] today';
		const result = applyLinkShortenings(
			text,
			[{ original: '[[People/Bob]]', shortened: '[[Bob]]' }]
		);
		expect(result).toBe(text);
	});
});

describe('hasNonMarkdownExtension', () => {
	it('returns false for paths with no extension', () => {
		expect(hasNonMarkdownExtension('People/John Doe')).toBe(false);
		expect(hasNonMarkdownExtension('Projects/Alpha')).toBe(false);
		expect(hasNonMarkdownExtension('Simple Note')).toBe(false);
	});

	it('returns false for .md extension', () => {
		expect(hasNonMarkdownExtension('People/John.md')).toBe(false);
		expect(hasNonMarkdownExtension('note.md')).toBe(false);
	});

	it('returns false for .MD extension (case insensitive)', () => {
		expect(hasNonMarkdownExtension('File.MD')).toBe(false);
		expect(hasNonMarkdownExtension('File.Md')).toBe(false);
	});

	it('returns true for common non-markdown extensions', () => {
		expect(hasNonMarkdownExtension('image.png')).toBe(true);
		expect(hasNonMarkdownExtension('doc.pdf')).toBe(true);
		expect(hasNonMarkdownExtension('photo.jpg')).toBe(true);
		expect(hasNonMarkdownExtension('data.csv')).toBe(true);
		expect(hasNonMarkdownExtension('archive.zip')).toBe(true);
	});

	it('returns true for extensions in paths with folders', () => {
		expect(hasNonMarkdownExtension('Attachments/file.pdf')).toBe(true);
		expect(hasNonMarkdownExtension('Assets/Images/photo.png')).toBe(true);
	});

	it('returns false for trailing dot (empty extension)', () => {
		expect(hasNonMarkdownExtension('file.')).toBe(false);
	});

	it('returns false for extensions longer than 5 characters', () => {
		// Avoids false positives from dots in names like "Dr. Smith"
		expect(hasNonMarkdownExtension('People/Dr. Smith')).toBe(false);
		expect(hasNonMarkdownExtension('Notes/Rev. Johnson')).toBe(false);
	});

	it('uses the last dot for multi-dot paths', () => {
		// "file.name.pdf" → ext is "pdf"
		expect(hasNonMarkdownExtension('file.name.pdf')).toBe(true);
		// "file.backup.md" → ext is "md"
		expect(hasNonMarkdownExtension('file.backup.md')).toBe(false);
	});

	it('handles short valid extensions at the boundary', () => {
		// 1-5 char extensions should be detected
		expect(hasNonMarkdownExtension('file.a')).toBe(true);    // 1 char
		expect(hasNonMarkdownExtension('file.js')).toBe(true);   // 2 chars
		expect(hasNonMarkdownExtension('file.tsx')).toBe(true);  // 3 chars
		expect(hasNonMarkdownExtension('file.json')).toBe(true); // 4 chars
		expect(hasNonMarkdownExtension('file.xhtml')).toBe(true); // 5 chars
		expect(hasNonMarkdownExtension('file.svelte')).toBe(false); // 6 chars - too long
	});
});
