import { App, PluginSettingTab, Setting } from 'obsidian';
import LinkForgePlugin from './main';

export interface LinkForgeSettings {
	enabled: boolean;
	watchedFolders: string[];
	applyTemplaterTemplates: boolean;
	shortenLinksAfterCreation: boolean;
}

export const DEFAULT_SETTINGS: LinkForgeSettings = {
	enabled: true,
	watchedFolders: ['People/', 'Projects/'],
	applyTemplaterTemplates: true,
	shortenLinksAfterCreation: true,
};

export class LinkForgeSettingTab extends PluginSettingTab {
	plugin: LinkForgePlugin;

	constructor(app: App, plugin: LinkForgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Enabled')
			.setDesc('Global toggle for auto-creating linked files.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Watched folders')
			.setDesc('Only auto-create files for links targeting these folders (comma-separated, e.g. "People/, Projects/").')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('People/, Projects/')
				.setValue(this.plugin.settings.watchedFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.watchedFolders = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName('Apply Templater templates')
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Trigger Templater folder templates on newly created files (requires Templater plugin).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.applyTemplaterTemplates)
				.onChange(async (value) => {
					this.plugin.settings.applyTemplaterTemplates = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Shorten links after creation')
			.setDesc('Rewrite full-path wikilinks to shortest unique name after the file is created (e.g. [[People/Name]] → [[Name]]).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.shortenLinksAfterCreation)
				.onChange(async (value) => {
					this.plugin.settings.shortenLinksAfterCreation = value;
					await this.plugin.saveSettings();
				}));
	}
}
