import { App, TFile, requestUrl } from "obsidian";
import TurndownService from "turndown";
import type { WeChatImporterSettings } from "../settings";
import type { ImportResult, ParsedWeChatArticle, RebuildResult } from "../types";
import { ensureFolderExists, getAvailableNotePath, getParentFolder, cleanText } from "../utils/path-utils";
import { localizeImagesInElement } from "./image-localizer";

const WECHAT_USER_AGENT =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47";

function assertWeChatUrl(url: string): URL {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url.trim());
	} catch {
		throw new Error("Please provide a valid URL.");
	}

	if (parsedUrl.hostname !== "mp.weixin.qq.com") {
		throw new Error("Only mp.weixin.qq.com article URLs are supported in V1.");
	}

	return parsedUrl;
}

async function fetchArticleHtml(url: string): Promise<string> {
	const response = await requestUrl({
		url,
		method: "GET",
		headers: {
			"User-Agent": WECHAT_USER_AGENT,
			"Referer": "https://mp.weixin.qq.com/",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
		},
		throw: false
	});

	if (response.status >= 400) {
		throw new Error(`Article request failed with status ${response.status}.`);
	}

	return response.text;
}

function getMetaContent(document: Document, selector: string): string {
	const metaElement = document.querySelector(selector);
	const content = metaElement?.getAttribute("content");
	return content ? cleanText(content) : "";
}

function extractPublished(html: string, document: Document): string {
	const publishedElement = document.querySelector("#publish_time, .publish_time");
	const publishedText = publishedElement?.textContent ? cleanText(publishedElement.textContent) : "";
	if (publishedText) {
		return publishedText;
	}

	const metaPublished = getMetaContent(document, 'meta[property="article:published_time"]');
	if (metaPublished) {
		return metaPublished;
	}

	const regexes = [
		/create_time:\s*JsDecode\('([^']+)'\)/,
		/publish_time"\s*:\s*"([^"]+)"/,
		/ct\s*=\s*"([^"]+)"/
	];

	for (const regex of regexes) {
		const match = html.match(regex);
		if (match?.[1]) {
			return cleanText(match[1]);
		}
	}

	return "";
}

function cleanupArticleContent(contentElement: HTMLElement): void {
	contentElement.querySelectorAll("script, style, noscript, iframe").forEach((element) => element.remove());

	const disposableSelectors = [
		".js_ad_link",
		".wx_profile_card_inner",
		".qr_code_pc_outer",
		".original_area_primary",
		".reward_area",
		".js_product_loop_content",
		".js_weapp_display_element"
	];

	for (const selector of disposableSelectors) {
		contentElement.querySelectorAll(selector).forEach((element) => element.remove());
	}

	contentElement.querySelectorAll("*").forEach((element) => {
		element.removeAttribute("style");
		element.removeAttribute("width");
		element.removeAttribute("height");
	});
}

function parseWeChatArticle(url: string, html: string): ParsedWeChatArticle {
	const document = new DOMParser().parseFromString(html, "text/html");
	const title = cleanText(
		document.querySelector("#activity-name, h1.rich_media_title, h1")?.textContent
		|| getMetaContent(document, 'meta[property="og:title"]')
		|| document.title
		|| "Untitled WeChat article"
	);

	const author = cleanText(
		document.querySelector("#js_name, .profile_nickname")?.textContent
		|| getMetaContent(document, 'meta[name="author"]')
		|| "Unknown author"
	);

	const contentElement = document.querySelector("#js_content");
	if (!(contentElement instanceof HTMLElement)) {
		throw new Error("Could not find the article body. The page may require a logged-in browser session or WeChat changed the DOM.");
	}

	const contentClone = contentElement.cloneNode(true) as HTMLElement;
	cleanupArticleContent(contentClone);

	const excerpt = cleanText(contentClone.textContent || "").slice(0, 180);

	return {
		url,
		title,
		author,
		published: extractPublished(html, document),
		contentHtml: contentClone.innerHTML,
		excerpt
	};
}

function buildNoteBaseName(article: ParsedWeChatArticle, prefixPublishedDate: boolean): string {
	if (!prefixPublishedDate || !article.published) {
		return article.title;
	}

	const dateMatch = article.published.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
	if (!dateMatch) {
		return article.title;
	}

	const normalizedDate = dateMatch[0].replace(/[/.]/g, "-");
	return `${normalizedDate} ${article.title}`;
}

function escapeYaml(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function createTurndownService(): TurndownService {
	const service = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
		emDelimiter: "*"
	});

	service.addRule("obsidianImageEmbed", {
		filter: (node) => node.nodeName === "IMG",
		replacement: (_content, node) => {
			const embedMarkdown = node.getAttribute("data-obsidian-embed");
			if (embedMarkdown) {
				return `\n\n${embedMarkdown}\n\n`;
			}

			const src = node.getAttribute("src") || node.getAttribute("data-src") || "";
			if (!src) {
				return "";
			}

			const alt = node.getAttribute("alt") || "";
			return `\n\n![${alt}](${src})\n\n`;
		}
	});

	service.addRule("lineBreaks", {
		filter: "br",
		replacement: () => "  \n"
	});

	return service;
}

function buildNoteMarkdown(article: ParsedWeChatArticle, markdownBody: string): string {
	const sections = [
		"---",
		`title: ${escapeYaml(article.title)}`,
		`author: ${escapeYaml(article.author)}`,
		`published: ${escapeYaml(article.published || "")}`,
		`source: ${escapeYaml(article.url)}`,
		'site: "WeChat"',
		`excerpt: ${escapeYaml(article.excerpt)}`,
		`imported: ${escapeYaml(new Date().toISOString())}`,
		"---",
		"",
		`# ${article.title}`,
		"",
		`- Author: ${article.author}`,
		`- Published: ${article.published || "Unknown"}`,
		`- Source: ${article.url}`,
		"",
		markdownBody.trim(),
		""
	];

	return sections.join("\n");
}

export function extractWeChatSourceUrl(markdown: string): string | null {
	const frontmatterSourceMatch = markdown.match(/(?:^|\n)source:\s*["']?(https:\/\/mp\.weixin\.qq\.com\/[^"'\s]+)["']?/m);
	if (frontmatterSourceMatch?.[1]) {
		return frontmatterSourceMatch[1];
	}

	const inlineSourceMatch = markdown.match(/https:\/\/mp\.weixin\.qq\.com\/[^\s)"']+/);
	return inlineSourceMatch?.[0] ?? null;
}

function preserveExistingFrontmatter(existingMarkdown: string, newBody: string, article: ParsedWeChatArticle): string {
	const frontmatterMatch = existingMarkdown.match(/^---\n[\s\S]*?\n---\n?/);
	if (!frontmatterMatch) {
		return buildNoteMarkdown(article, newBody);
	}

	return `${frontmatterMatch[0].trimEnd()}\n${newBody.trim()}\n`;
}

async function buildArticleBodyMarkdown(app: App, notePath: string, attachmentFolder: string, article: ParsedWeChatArticle): Promise<{ body: string; downloadedImageCount: number }> {
	const articleDocument = new DOMParser().parseFromString(`<div id="wechat-root">${article.contentHtml}</div>`, "text/html");
	const contentRoot = articleDocument.querySelector("#wechat-root");
	if (!(contentRoot instanceof HTMLElement)) {
		throw new Error("Failed to prepare the article body for conversion.");
	}

	const downloadedImageCount = await localizeImagesInElement(app, contentRoot, notePath, attachmentFolder);
	const body = createTurndownService().turndown(contentRoot.innerHTML);
	return { body, downloadedImageCount };
}

async function fetchParsedWeChatArticle(rawUrl: string): Promise<ParsedWeChatArticle> {
	const parsedUrl = assertWeChatUrl(rawUrl);
	const articleUrl = parsedUrl.toString();
	const html = await fetchArticleHtml(articleUrl);
	return parseWeChatArticle(articleUrl, html);
}

export async function importWeChatArticle(app: App, settings: WeChatImporterSettings, rawUrl: string): Promise<ImportResult> {
	const article = await fetchParsedWeChatArticle(rawUrl);
	const notePath = await getAvailableNotePath(app, settings.noteFolder, buildNoteBaseName(article, settings.prefixPublishedDate));

	await ensureFolderExists(app, getParentFolder(notePath));

	const { body, downloadedImageCount } = await buildArticleBodyMarkdown(app, notePath, settings.attachmentFolder, article);
	const noteFile = await app.vault.create(notePath, buildNoteMarkdown(article, body));

	if (settings.openNoteAfterImport) {
		await app.workspace.getLeaf(true).openFile(noteFile);
	}

	return {
		noteFile,
		title: article.title,
		downloadedImageCount
	};
}

export async function rebuildWeChatArticleFile(app: App, file: TFile, rawUrl: string, attachmentFolder: string): Promise<RebuildResult> {
	const article = await fetchParsedWeChatArticle(rawUrl);
	const { body, downloadedImageCount } = await buildArticleBodyMarkdown(app, file.path, attachmentFolder, article);
	const existingMarkdown = await app.vault.read(file);
	await app.vault.modify(file, preserveExistingFrontmatter(existingMarkdown, body, article));

	return {
		title: article.title,
		downloadedImageCount
	};
}
