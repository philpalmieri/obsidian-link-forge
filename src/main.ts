import { Plugin, TFile, TAbstractFile, MarkdownView, Editor, normalizePath } from 'obsidian';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { DEFAULT_SETTINGS, LinkForgeSettings, LinkForgeSettingTab } from './settings';
import { extractWikilinks, isInWatchedFolder, buildShortenedLink, applyLinkShortenings, ParsedWikilink } from './utils';

interface ProcessingContext {
	lineText: string;
	lineNumber: number;
	sourceFilePath: string;
	editor: Editor;
}

export default class LinkForgePlugin extends Plugin {
	settings!: LinkForgeSettings;
	private pendingWork: ProcessingContext | null = null;
	private processing = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LinkForgeSettingTab(this.app, this));

		const lineChangeExtension = EditorView.updateListener.of((update: ViewUpdate) => {
			if (!this.settings.enabled) return;
			if (!update.docChanged && !update.selectionSet) return;

			const oldLine = update.startState.doc.lineAt(
				update.startState.selection.main.head
			).number;
			const newLine = update.state.doc.lineAt(
				update.state.selection.main.head
			).number;

			if (oldLine !== newLine) {
				// Read the previous line from the OLD document state
				const previousLineText = update.startState.doc.line(oldLine).text;

				// Capture editor context now while it's guaranteed stable
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view?.file) return;

				const context: ProcessingContext = {
					lineText: previousLineText,
					lineNumber: oldLine,
					sourceFilePath: view.file.path,
					editor: view.editor,
				};

				void this.enqueueProcessing(context);
			}
		});

		this.registerEditorExtension([lineChangeExtension]);
	}

	onunload() {}

	/**
	 * Enqueue line processing. If already processing, stores the latest
	 * pending context (coalesces rapid changes). After current work finishes,
	 * drains the pending item.
	 */
	private async enqueueProcessing(context: ProcessingContext): Promise<void> {
		if (this.processing) {
			this.pendingWork = context;
			return;
		}

		this.processing = true;
		try {
			await this.processLineForUnresolvedLinks(context);
		} finally {
			this.processing = false;
		}

		// Drain any pending work that arrived during processing
		if (this.pendingWork) {
			const next = this.pendingWork;
			this.pendingWork = null;
			void this.enqueueProcessing(next);
		}
	}

	/**
	 * Extract wikilinks from a line and create files for unresolved ones
	 * that target watched folders. After creation, shorten links if possible.
	 */
	private async processLineForUnresolvedLinks(context: ProcessingContext): Promise<void> {
		const { lineText, lineNumber, sourceFilePath, editor } = context;
		const links = extractWikilinks(lineText);
		const createdLinks: ParsedWikilink[] = [];

		for (const link of links) {
			if (!isInWatchedFolder(link.linkPath, this.settings.watchedFolders)) continue;

			// Skip links that target non-markdown extensions
			if (this.hasNonMarkdownExtension(link.linkPath)) continue;

			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
				link.linkPath,
				sourceFilePath
			);

			if (!resolvedFile) {
				const created = await this.createFileFromLink(link.linkPath);
				if (created) {
					createdLinks.push(link);
				}
			}
		}

		if (this.settings.shortenLinksAfterCreation && createdLinks.length > 0) {
			this.shortenLinks(createdLinks, lineNumber, sourceFilePath, editor);
		}
	}

	/**
	 * Check if a link path has a non-markdown file extension.
	 */
	private hasNonMarkdownExtension(linkPath: string): boolean {
		const lastDot = linkPath.lastIndexOf('.');
		if (lastDot === -1) return false;
		const ext = linkPath.substring(lastDot + 1).toLowerCase();
		return ext !== 'md' && ext.length > 0 && ext.length <= 5;
	}

	/**
	 * Create a file (and parent folders) for an unresolved link path.
	 * Returns true if the file now exists, false on failure.
	 */
	private async createFileFromLink(linkPath: string): Promise<boolean> {
		const filePath = normalizePath(linkPath.endsWith('.md') ? linkPath : linkPath + '.md');

		// Validate: must have a non-empty basename
		const basename = filePath.substring(filePath.lastIndexOf('/') + 1);
		if (!basename || basename === '.md') return false;

		const dir = filePath.substring(0, filePath.lastIndexOf('/'));
		if (dir) {
			await this.ensureFolderExists(dir);
		}

		try {
			await this.app.vault.create(filePath, '');
			console.debug(`[Link Forge] Created: ${filePath}`);
			return true;
		} catch {
			// Check if file exists now (race condition with concurrent creation)
			const existing = this.app.vault.getAbstractFileByPath(filePath);
			return existing instanceof TFile;
		}
	}

	/**
	 * Recursively ensure a folder path exists.
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		const existing: TAbstractFile | null = this.app.vault.getAbstractFileByPath(folderPath);
		if (existing) return;

		const parent = folderPath.substring(0, folderPath.lastIndexOf('/'));
		if (parent) {
			await this.ensureFolderExists(parent);
		}

		try {
			await this.app.vault.createFolder(folderPath);
		} catch {
			// Folder may have been created concurrently
		}
	}

	/**
	 * Shorten wikilinks in the editor after file creation.
	 * Uses the captured editor reference to avoid acting on a different note.
	 */
	private shortenLinks(
		createdLinks: ParsedWikilink[],
		lineNumber: number,
		sourceFilePath: string,
		editor: Editor
	): void {
		// Verify the editor still corresponds to the same file
		const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!currentView?.file || currentView.file.path !== sourceFilePath) return;
		if (currentView.editor !== editor) return;

		const lineIndex = lineNumber - 1;
		if (lineIndex < 0 || lineIndex >= editor.lineCount()) return;
		const currentLineText = editor.getLine(lineIndex);

		const replacements: { original: string; shortened: string }[] = [];

		for (const { original, linkPath, heading, alias } of createdLinks) {
			const filePath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
			const createdFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!createdFile || !(createdFile instanceof TFile)) continue;

			const basename = createdFile.basename;

			// Verify the basename alone resolves uniquely to our file
			const resolved = this.app.metadataCache.getFirstLinkpathDest(basename, sourceFilePath);
			if (!resolved || resolved.path !== createdFile.path) continue;

			const shortened = buildShortenedLink(original, basename, heading, alias);
			if (shortened) {
				replacements.push({ original, shortened });
				console.debug(`[Link Forge] Shortened: ${original} → ${shortened}`);
			}
		}

		if (replacements.length > 0) {
			const newLineText = applyLinkShortenings(currentLineText, replacements);
			if (newLineText !== currentLineText) {
				editor.setLine(lineIndex, newLineText);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<LinkForgeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
