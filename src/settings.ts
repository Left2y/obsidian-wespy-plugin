import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type WeChatImporterPlugin from "./main";

export interface WeChatImporterSettings {
	noteFolder: string;
	attachmentFolder: string;
	openNoteAfterImport: boolean;
	prefixPublishedDate: boolean;
	autoLocalizeOnCreate: boolean;
	rebuildWeChatClipsFromSource: boolean;
	autoLocalizeFolders: string;
}

export const DEFAULT_SETTINGS: WeChatImporterSettings = {
	noteFolder: "Clippings/WeChat",
	attachmentFolder: "_attachments",
	openNoteAfterImport: true,
	prefixPublishedDate: true,
	autoLocalizeOnCreate: true,
	rebuildWeChatClipsFromSource: true,
	autoLocalizeFolders: "📚 Sources\nClippings"
};

export class WeChatImporterSettingTab extends PluginSettingTab {
	plugin: WeChatImporterPlugin;

	constructor(app: App, plugin: WeChatImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Import folder")
			.setDesc("Where imported notes should be created inside the vault")
			.addText((text) => text
				.setPlaceholder("Example: clippings/wechat")
				.setValue(this.plugin.settings.noteFolder)
				.onChange(async (value) => {
					this.plugin.settings.noteFolder = normalizePath(value.trim() || DEFAULT_SETTINGS.noteFolder);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Image attachment subfolder")
			.setDesc("Downloaded images are saved under this subfolder next to the note.")
			.addText((text) => text
				.setPlaceholder("_attachments")
				.setValue(this.plugin.settings.attachmentFolder)
				.onChange(async (value) => {
					this.plugin.settings.attachmentFolder = normalizePath(value.trim() || DEFAULT_SETTINGS.attachmentFolder);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Prefix published date")
			.setDesc("Use the article publish date as a filename prefix when available.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.prefixPublishedDate)
				.onChange(async (value) => {
					this.plugin.settings.prefixPublishedDate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Open note after import")
			.setDesc("Open the imported note immediately after it is created.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.openNoteAfterImport)
				.onChange(async (value) => {
					this.plugin.settings.openNoteAfterImport = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-localize clipped notes")
			.setDesc("Download images when a new clipped note is created")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.autoLocalizeOnCreate)
				.onChange(async (value) => {
					this.plugin.settings.autoLocalizeOnCreate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Rebuild clips from source")
			.setDesc("Fetch the original article to recover missing images")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.rebuildWeChatClipsFromSource)
				.onChange(async (value) => {
					this.plugin.settings.rebuildWeChatClipsFromSource = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Watched folders")
			.setDesc("One vault folder per line for auto-localizing new clipped notes")
			.addTextArea((text) => text
				.setPlaceholder("Example folder list")
				.setValue(this.plugin.settings.autoLocalizeFolders)
				.onChange(async (value) => {
					this.plugin.settings.autoLocalizeFolders = value;
					await this.plugin.saveSettings();
				}));
	}
}
