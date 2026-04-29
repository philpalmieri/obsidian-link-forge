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
	watchedFolders: [],
	applyTemplaterTemplates: false,
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

		const watchedFoldersSetting = new Setting(containerEl)
			.setName('Watched folders')
			.setDesc('Only auto-create files for links targeting these folders (comma-separated). Leave empty to watch all folders.')
			.addText(text => text
				.setPlaceholder('e.g. People/, Projects/')
				.setValue(this.plugin.settings.watchedFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.watchedFolders = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));
		watchedFoldersSetting.descEl.createEl('br');
		watchedFoldersSetting.descEl.createEl('small', {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			text: 'Tip: use folder prefixes like "People/, Projects/, Areas/" to limit auto-creation to specific parts of your vault.',
			cls: 'setting-item-description',
		});

		// Templater section
		const templaterAvailable = this.plugin.isTemplaterAvailable();

		const templaterSetting = new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName('Apply Templater templates');

		if (templaterAvailable) {
			templaterSetting
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setDesc('Trigger Templater folder templates on newly created files.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.applyTemplaterTemplates)
					.onChange(async (value) => {
						this.plugin.settings.applyTemplaterTemplates = value;
						await this.plugin.saveSettings();
					}));
		} else {
			templaterSetting
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setDesc('Requires the Templater plugin to be installed and active. Install Templater from Community Plugins to enable this feature.')
				.addToggle(toggle => toggle
					.setValue(false)
					.setDisabled(true));
			// eslint-disable-next-line obsidianmd/no-static-styles-assignment
			templaterSetting.descEl.style.color = 'var(--text-muted)';
		}

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
