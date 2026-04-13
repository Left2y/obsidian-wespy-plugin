import { App, Modal, Setting, TextComponent } from "obsidian";

export class UrlPromptModal extends Modal {
	private readonly titleText: string;
	private readonly onSubmit: (url: string) => Promise<void>;
	private inputComponent: TextComponent | null = null;

	constructor(app: App, titleText: string, onSubmit: (url: string) => Promise<void>) {
		super(app);
		this.titleText = titleText;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.titleText });

		new Setting(contentEl)
			.setName("Article link")
			.setDesc("Paste a link from mp.weixin.qq.com")
			.addText((text) => {
				this.inputComponent = text;
				text
					.setPlaceholder("https://mp.weixin.qq.com/s/...")
					.onChange(() => undefined);

					text.inputEl.addEventListener("keydown", (event) => {
						if (event.key !== "Enter") {
							return;
						}

						event.preventDefault();
						void this.submit();
					});
			});

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText("Import")
				.setCta()
				.onClick(async () => {
					await this.submit();
				}))
			.addButton((button) => button
				.setButtonText("Cancel")
				.onClick(() => this.close()));

		window.setTimeout(() => this.inputComponent?.inputEl.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}

	private async submit() {
		const url = this.inputComponent?.getValue().trim();
		if (!url) {
			return;
		}

		this.close();
		await this.onSubmit(url);
	}
}
