import { Plugin, TFile, TAbstractFile, MarkdownView, Notice } from 'obsidian';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { DEFAULT_SETTINGS, LinkForgeSettings, LinkForgeSettingTab } from './settings';
import { extractWikilinks, isInWatchedFolder, buildShortenedLink, applyLinkShortenings } from './utils';

export default class LinkForgePlugin extends Plugin {
	settings: LinkForgeSettings;
	private processing = false;
	private templaterNoticeShown = false;

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
			const links = extractWikilinks(lineText);
			const createdLinks: { original: string; linkPath: string; heading: string | undefined; alias: string | undefined }[] = [];

			for (const link of links) {
				if (!isInWatchedFolder(link.linkPath, this.settings.watchedFolders)) continue;

				const activeFile = this.app.workspace.getActiveFile();
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
					link.linkPath,
					activeFile?.path ?? ''
				);

				if (!resolvedFile) {
					await this.createFileFromLink(link.linkPath);
					createdLinks.push(link);
				}
			}

			if (this.settings.shortenLinksAfterCreation && createdLinks.length > 0) {
				await this.shortenLinks(createdLinks, lineNumber);
			}
		} finally {
			this.processing = false;
		}
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
			console.debug(`[Link Forge] Created: ${filePath}`);

			if (this.settings.applyTemplaterTemplates) {
				if (this.isTemplaterAvailable()) {
					await this.triggerTemplater(newFile);
				} else if (!this.templaterNoticeShown) {
					this.templaterNoticeShown = true;
					new Notice(
						// eslint-disable-next-line obsidianmd/ui/sentence-case
						'Link Forge: Templater integration is enabled but Templater is not installed or active. Files will be created without templates.',
						8000
					);
				}
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
	 * Rewrites [[People/Johnny Appleseed]] to [[Johnny Appleseed]] if the
	 * basename resolves uniquely to the created file.
	 */
	private async shortenLinks(
		createdLinks: { original: string; linkPath: string; heading: string | undefined; alias: string | undefined }[],
		lineNumber: number
	): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		const activeFilePath = view.file?.path ?? '';

		const lineIndex = lineNumber - 1;
		if (lineIndex < 0 || lineIndex >= editor.lineCount()) return;
		let currentLineText = editor.getLine(lineIndex);

		const replacements: { original: string; shortened: string }[] = [];

		for (const { original, linkPath, heading, alias } of createdLinks) {
			const filePath = linkPath.endsWith('.md') ? linkPath : linkPath + '.md';
			const createdFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!createdFile || !(createdFile instanceof TFile)) continue;

			const basename = createdFile.basename;

			// Verify the basename alone resolves uniquely to our file
			const resolved = this.app.metadataCache.getFirstLinkpathDest(basename, activeFilePath);
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

	/**
	 * Check if the Templater plugin is installed and enabled.
	 */
	isTemplaterAvailable(): boolean {
		/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
		const templater = (this.app as any).plugins?.plugins?.['templater-obsidian'];
		return !!templater?.templater;
		/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
	}

	/**
	 * Trigger Templater to apply its folder template to a newly created file.
	 */
	private async triggerTemplater(file: TFile): Promise<void> {
		try {
			/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const templater = (this.app as any).plugins?.plugins?.['templater-obsidian'];
			if (!templater?.templater) return;

			const runningConfig = templater.templater.create_running_config(
				undefined, // template file (undefined = use folder template)
				file,
				0 // run mode: 0 = create new from template
			);

			if (runningConfig) {
				await templater.templater.read_and_parse_template(runningConfig);
			}
			/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
		} catch (e) {
			console.debug('[Link Forge] Templater integration skipped:', e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<LinkForgeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
