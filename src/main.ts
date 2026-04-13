import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { localizeExternalImagesInActiveNote, localizeExternalImagesInFile } from "./services/image-localizer";
import { extractWeChatSourceUrl, importWeChatArticle, rebuildWeChatArticleFile } from "./services/wechat-importer";
import { DEFAULT_SETTINGS, WeChatImporterSettingTab, type WeChatImporterSettings } from "./settings";
import { UrlPromptModal } from "./ui/url-modal";

const RECENT_CLIP_WINDOW_MS = 30 * 60 * 1000;
const AUTO_LOCALIZE_DELAY_MS = 2500;
const SELF_MODIFY_SUPPRESSION_MS = 10_000;

export default class WeChatImporterPlugin extends Plugin {
	settings: WeChatImporterSettings;
	private readonly pendingAutoLocalization = new Set<string>();
	private readonly clippedNoteCandidates = new Map<string, number>();
	private readonly suppressedAutoLocalizationUntil = new Map<string, number>();

	async onload() {
		await this.loadSettings();
		await this.logDebug("loaded", {
			version: this.manifest.version,
			autoLocalizeOnCreate: this.settings.autoLocalizeOnCreate,
			rebuildWeChatClipsFromSource: this.settings.rebuildWeChatClipsFromSource,
			autoLocalizeFolders: this.settings.autoLocalizeFolders
		});

		this.addCommand({
			id: "import-wechat-article-from-url",
			name: "Import article from link",
			callback: () => {
				new UrlPromptModal(this.app, "Import WeChat article", async (url) => {
					await this.runImport(url);
				}).open();
			}
		});

		this.addCommand({
			id: "import-wechat-article-from-clipboard",
			name: "Import article from clipboard",
			callback: async () => {
				try {
					const clipboardText = (await navigator.clipboard.readText()).trim();
					if (!clipboardText) {
						throw new Error("Clipboard is empty.");
					}

					await this.runImport(clipboardText);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`WeChat import failed: ${message}`);
				}
			}
		});

		this.addCommand({
			id: "download-external-images-in-current-note",
			name: "Download external images in current note",
			callback: async () => {
				try {
					const downloadedImageCount = await localizeExternalImagesInActiveNote(this.app);
					if (downloadedImageCount === 0) {
						new Notice("No external images found in the current note.");
						return;
					}

					new Notice(`Downloaded ${downloadedImageCount} image${downloadedImageCount === 1 ? "" : "s"} into the vault.`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Image download failed: ${message}`);
				}
			}
		});

		this.addCommand({
			id: "rebuild-current-wechat-note-from-source",
			name: "Rebuild current note from source",
			callback: async () => {
				await this.rebuildActiveWeChatNote();
			}
		});

		this.registerEvent(this.app.vault.on("create", (file) => {
			if (!(file instanceof TFile)) {
				return;
			}

			this.trackClippedNoteCandidate(file);
			this.scheduleAutoLocalize(file, "create");
		}));

		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (!(file instanceof TFile)) {
				return;
			}

			this.scheduleAutoLocalize(file, "modify", true);
		}));

		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (!(file instanceof TFile)) {
				return;
			}

			this.scheduleAutoLocalize(file, "metadata changed", true);
		}));

		this.addSettingTab(new WeChatImporterSettingTab(this.app, this));

		window.setTimeout(() => {
			void this.scanRecentWeChatClips();
		}, 5000);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<WeChatImporterSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private trackClippedNoteCandidate(file: TFile) {
		if (file.extension === "md" && this.isInWatchedFolder(file.path)) {
			this.clippedNoteCandidates.set(file.path, Date.now());
		}
	}

	private scheduleAutoLocalize(file: TFile, reason: string, allowRecentFile = false) {
		if (!this.settings.autoLocalizeOnCreate) {
			return;
		}

		if (!this.isAutoLocalizeCandidate(file, allowRecentFile)) {
			return;
		}

		if (this.pendingAutoLocalization.has(file.path)) {
			return;
		}

		this.pendingAutoLocalization.add(file.path);
		const timeoutId = window.setTimeout(() => {
			void this.autoLocalizeFile(file, reason);
		}, AUTO_LOCALIZE_DELAY_MS);

		this.register(() => window.clearTimeout(timeoutId));
	}

	private async autoLocalizeFile(file: TFile, reason: string) {
		try {
			await this.logDebug("auto-localize started", { path: file.path, reason });
			const markdown = await this.app.vault.read(file);
			if (!this.shouldAutoLocalize(markdown)) {
				await this.logDebug("auto-localize skipped; no WeChat source", { path: file.path, reason });
				return;
			}

			const sourceUrl = extractWeChatSourceUrl(markdown);
			if (sourceUrl && this.settings.rebuildWeChatClipsFromSource) {
				this.suppressAutoLocalization(file.path);
				const result = await rebuildWeChatArticleFile(this.app, file, sourceUrl);
				this.clippedNoteCandidates.delete(file.path);
				await this.logDebug("auto-localize rebuilt note", {
					path: file.path,
					reason,
					title: result.title,
					downloadedImageCount: result.downloadedImageCount
				});
				new Notice(`Rebuilt WeChat note "${result.title}" with ${result.downloadedImageCount} image${result.downloadedImageCount === 1 ? "" : "s"}.`);
				return;
			}

			this.suppressAutoLocalization(file.path);
			const downloadedImageCount = await localizeExternalImagesInFile(this.app, file);
			if (downloadedImageCount > 0) {
				this.clippedNoteCandidates.delete(file.path);
			}

			if (downloadedImageCount > 0) {
				await this.logDebug("auto-localize downloaded markdown images", { path: file.path, reason, downloadedImageCount });
				new Notice(`Downloaded ${downloadedImageCount} clipped image${downloadedImageCount === 1 ? "" : "s"} for ${file.basename}.`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[WeChat Offline Importer] Auto-localize failed for ${file.path}: ${message}`);
			await this.logDebug("auto-localize failed", { path: file.path, reason, message });
		} finally {
			this.pendingAutoLocalization.delete(file.path);
		}
	}

	private shouldAutoLocalize(markdown: string): boolean {
		return extractWeChatSourceUrl(markdown) !== null;
	}

	private isAutoLocalizeCandidate(file: TFile, allowRecentFile: boolean): boolean {
		if (file.extension !== "md" || !this.isInWatchedFolder(file.path)) {
			return false;
		}

		const suppressedUntil = this.suppressedAutoLocalizationUntil.get(file.path) ?? 0;
		if (suppressedUntil > Date.now()) {
			return false;
		}

		if (suppressedUntil) {
			this.suppressedAutoLocalizationUntil.delete(file.path);
		}

		const firstSeen = this.clippedNoteCandidates.get(file.path);
		if (!firstSeen) {
			return allowRecentFile && this.isRecentlyTouched(file);
		}

		if (Date.now() - firstSeen > RECENT_CLIP_WINDOW_MS) {
			this.clippedNoteCandidates.delete(file.path);
			return false;
		}

		return true;
	}

	private suppressAutoLocalization(path: string) {
		this.suppressedAutoLocalizationUntil.set(path, Date.now() + SELF_MODIFY_SUPPRESSION_MS);
	}

	private isRecentlyTouched(file: TFile): boolean {
		const now = Date.now();
		return now - file.stat.ctime <= RECENT_CLIP_WINDOW_MS || now - file.stat.mtime <= RECENT_CLIP_WINDOW_MS;
	}

	private async scanRecentWeChatClips() {
		const candidates = this.app.vault.getMarkdownFiles()
			.filter((file) => this.isInWatchedFolder(file.path) && this.isRecentlyTouched(file));

		await this.logDebug("startup scan", { candidateCount: candidates.length });

		for (const file of candidates) {
			this.scheduleAutoLocalize(file, "startup scan", true);
		}
	}

	private isInWatchedFolder(path: string): boolean {
		const normalizedPath = normalizePath(path);
		const watchedFolders = this.settings.autoLocalizeFolders
			.split("\n")
			.map((folder) => normalizePath(folder.trim()))
			.filter(Boolean);

		if (watchedFolders.length === 0) {
			return true;
		}

		return watchedFolders.some((folder) =>
			normalizedPath === folder || normalizedPath.startsWith(`${folder}/`)
		);
	}

	private async runImport(url: string) {
		try {
			const result = await importWeChatArticle(this.app, this.settings, url);
			new Notice(
				`Imported "${result.title}" and downloaded ${result.downloadedImageCount} image${result.downloadedImageCount === 1 ? "" : "s"}.`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`WeChat import failed: ${message}`);
		}
	}

	private async rebuildActiveWeChatNote() {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				throw new Error("Open a WeChat note first.");
			}

			const markdown = await this.app.vault.read(activeFile);
			const sourceUrl = extractWeChatSourceUrl(markdown);
			if (!sourceUrl) {
				throw new Error("No WeChat source URL found in the current note.");
			}

			this.suppressAutoLocalization(activeFile.path);
			const result = await rebuildWeChatArticleFile(this.app, activeFile, sourceUrl);
			await this.logDebug("manual rebuild completed", {
				path: activeFile.path,
				title: result.title,
				downloadedImageCount: result.downloadedImageCount
			});
			new Notice(`Rebuilt "${result.title}" and downloaded ${result.downloadedImageCount} image${result.downloadedImageCount === 1 ? "" : "s"}.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.logDebug("manual rebuild failed", { message });
			new Notice(`WeChat rebuild failed: ${message}`);
		}
	}

	private async logDebug(message: string, details: Record<string, unknown> = {}) {
		try {
			const line = `${new Date().toISOString()} ${message} ${JSON.stringify(details)}\n`;
			await this.app.vault.adapter.append(`${this.manifest.dir}/debug.log`, line);
		} catch (error) {
			console.debug("[WeChat Offline Importer]", message, details, error);
		}
	}
}
