import { Plugin, TFile, TAbstractFile, MarkdownView } from 'obsidian';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { DEFAULT_SETTINGS, LinkForgeSettings, LinkForgeSettingTab } from './settings';

export default class LinkForgePlugin extends Plugin {
	settings: LinkForgeSettings;
	private processing = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LinkForgeSettingTab(this.app, this));

		// CM6 extension: detect when cursor moves to a new line
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
				const previousLineText = update.state.doc.line(oldLine).text;
				void this.processLineForUnresolvedLinks(previousLineText, oldLine);
			}
		});

		this.registerEditorExtension([lineChangeExtension]);
	}

	onunload() {}

	/**
	 * Extract wikilinks from a line and create files for unresolved ones
	 * that target watched folders. After creation, shorten links if possible.
	 */
	async processLineForUnresolvedLinks(lineText: string, lineNumber: number) {
		if (this.processing) return;
		this.processing = true;

		try {
			const wikiLinkRegex = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
			let match: RegExpExecArray | null;
			const createdLinks: { original: string; linkPath: string }[] = [];

			while ((match = wikiLinkRegex.exec(lineText)) !== null) {
				const linkPath = match[1]?.trim();
				if (!linkPath) continue;

				// Check if link targets a watched folder
				if (!this.isInWatchedFolder(linkPath)) continue;

				// Check if file already exists
				const activeFile = this.app.workspace.getActiveFile();
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
					linkPath,
					activeFile?.path ?? ''
				);

				if (!resolvedFile) {
					await this.createFileFromLink(linkPath);
					createdLinks.push({ original: match[0], linkPath });
				}
			}

			// Shorten links in the editor after creation
			if (this.settings.shortenLinksAfterCreation && createdLinks.length > 0) {
				await this.shortenLinks(createdLinks, lineNumber);
			}
		} finally {
			this.processing = false;
		}
	}

	/**
	 * Check if a link path targets one of the configured watched folders.
	 */
	private isInWatchedFolder(linkPath: string): boolean {
		if (this.settings.watchedFolders.length === 0) return true;

		return this.settings.watchedFolders.some(folder => {
			const normalized = folder.endsWith('/') ? folder : folder + '/';
			return linkPath.startsWith(normalized);
		});
	}

	/**
	 * Create a file (and parent folders) for an unresolved link path.
	 * Optionally triggers Templater folder templates.
	 */
	private async createFileFromLink(linkPath: string): Promise<void> {
		const filePath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';

		// Ensure parent directories exist
		const dir = filePath.substring(0, filePath.lastIndexOf('/'));
		if (dir) {
			await this.ensureFolderExists(dir);
		}

		try {
			const newFile = await this.app.vault.create(filePath, '');
			console.log(`[Link Forge] Created: ${filePath}`);

			if (this.settings.applyTemplaterTemplates) {
				await this.triggerTemplater(newFile);
			}
		} catch {
			// File may already exist (race condition or concurrent creation)
		}
	}

	/**
	 * Recursively ensure a folder path exists.
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		const existing: TAbstractFile | null = this.app.vault.getAbstractFileByPath(folderPath);
		if (existing) return;

		// Ensure parent exists first
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
	 * Rewrites [[People/Johnny Appleseed]] → [[Johnny Appleseed]] if the
	 * basename resolves uniquely to the created file.
	 */
	private async shortenLinks(
		createdLinks: { original: string; linkPath: string }[],
		lineNumber: number
	): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		const activeFilePath = view.file?.path ?? '';

		// Re-read the line from the editor (it may have shifted, but lineNumber is stable here)
		const lineIndex = lineNumber - 1; // editor uses 0-based
		if (lineIndex < 0 || lineIndex >= editor.lineCount()) return;
		let currentLineText = editor.getLine(lineIndex);

		for (const { original, linkPath } of createdLinks) {
			const filePath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
			const createdFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!createdFile || !(createdFile instanceof TFile)) continue;

			// Get the shortest link path that resolves to this file
			const basename = createdFile.basename;

			// Verify the basename alone resolves to our file (no ambiguity)
			const resolved = this.app.metadataCache.getFirstLinkpathDest(basename, activeFilePath);
			if (!resolved || resolved.path !== createdFile.path) continue;

			// Build the shortened wikilink, preserving any alias
			const aliasMatch = original.match(/\[\[[^\]|#]+?(?:#[^\]|]*)?\|([^\]]+)\]\]/);
			const shortened = aliasMatch
				? `[[${basename}|${aliasMatch[1]}]]`
				: `[[${basename}]]`;

			if (original === shortened) continue;

			// Replace in the line text
			const newLineText = currentLineText.replace(original, shortened);
			if (newLineText !== currentLineText) {
				editor.setLine(lineIndex, newLineText);
				currentLineText = newLineText;
				console.log(`[Link Forge] Shortened: ${original} → ${shortened}`);
			}
		}
	}

	/**
	 * Trigger Templater to apply its folder template to a newly created file.
	 */
	private async triggerTemplater(file: TFile): Promise<void> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const templater = (this.app as any).plugins?.plugins?.['templater-obsidian'];
			if (!templater?.templater) return;

			// Templater exposes create_running_config and write_template_to_file
			const runningConfig = templater.templater.create_running_config(
				undefined, // template file (undefined = use folder template)
				file,
				0 // run mode: 0 = create new from template
			);

			if (runningConfig) {
				await templater.templater.read_and_parse_template(runningConfig);
			}
		} catch (e) {
			console.log('[Link Forge] Templater integration skipped:', e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<LinkForgeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
