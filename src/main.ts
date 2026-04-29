import { Editor, MarkdownView, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, LinkForgeSettings, LinkForgeSettingTab } from './settings';

export default class LinkForgePlugin extends Plugin {
	settings: LinkForgeSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LinkForgeSettingTab(this.app, this));

		// Register an editor change event to detect wikilinks and create missing files
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor, view: MarkdownView) => {
				void this.handleEditorChange(editor, view);
			})
		);
	}

	onunload() {
	}

	/**
	 * Detect wikilinks in the current editor content and auto-create any
	 * linked files that do not yet exist in the vault.
	 */
	async handleEditorChange(editor: Editor, view: MarkdownView) {
		if (!this.settings.autoCreateEnabled) return;

		const content = editor.getValue();
		const wikilinkPattern = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
		let match: RegExpExecArray | null;

		while ((match = wikilinkPattern.exec(content)) !== null) {
			const linkTarget = match[1]?.trim();
			if (!linkTarget) continue;

			// Resolve the linked file path relative to the current file
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				linkTarget,
				view.file?.path ?? ''
			);

			if (!linkedFile) {
				// File does not exist — create it
				const newPath = `${linkTarget}.md`;
				try {
					await this.app.vault.create(newPath, '');
				} catch {
					// File may have been created by a concurrent update; ignore
				}
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
