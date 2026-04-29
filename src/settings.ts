import { App, PluginSettingTab, Setting } from 'obsidian';
import LinkForgePlugin from './main';

export interface LinkForgeSettings {
	autoCreateEnabled: boolean;
}

export const DEFAULT_SETTINGS: LinkForgeSettings = {
	autoCreateEnabled: true,
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
			.setName('Auto-create linked files')
			.setDesc('Automatically create a new note when a wikilink target does not exist.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCreateEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autoCreateEnabled = value;
					await this.plugin.saveSettings();
				}));
	}
}
