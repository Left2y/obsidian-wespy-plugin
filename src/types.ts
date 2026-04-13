import type { TFile } from "obsidian";

export interface ParsedWeChatArticle {
	url: string;
	title: string;
	author: string;
	published: string;
	contentHtml: string;
	excerpt: string;
}

export interface ImportResult {
	noteFile: TFile;
	title: string;
	downloadedImageCount: number;
}

export interface RebuildResult {
	title: string;
	downloadedImageCount: number;
}

export interface LocalizeMarkdownResult {
	content: string;
	downloadedImageCount: number;
}
