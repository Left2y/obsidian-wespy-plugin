import { App, MarkdownView, TFile, requestUrl } from "obsidian";
import { ensureFolderExists, getParentFolder, sanitizePathSegment } from "../utils/path-utils";
import type { LocalizeMarkdownResult } from "../types";

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";
const WECHAT_USER_AGENT =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47";
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"([^"]*)")?\)/g;
const HTML_IMAGE_REGEX = /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

interface DownloadedAttachment {
	file: TFile;
	embedMarkdown: string;
}

function looksLikeWeChatUrl(imageUrl: string): boolean {
	try {
		const parsedUrl = new URL(imageUrl);
		return parsedUrl.hostname.includes("weixin.qq.com")
			|| parsedUrl.hostname.includes("mmbiz.qpic.cn")
			|| parsedUrl.hostname.endsWith("qpic.cn")
			|| parsedUrl.searchParams.has("wx_fmt");
	} catch {
		return false;
	}
}

function getRequestHeaders(imageUrl: string): Record<string, string> {
	if (looksLikeWeChatUrl(imageUrl)) {
		return {
			"User-Agent": WECHAT_USER_AGENT,
			"Referer": "https://mp.weixin.qq.com/",
			"Accept": "*/*"
		};
	}

	try {
		const parsedUrl = new URL(imageUrl);
		return {
			"User-Agent": DEFAULT_USER_AGENT,
			"Referer": `${parsedUrl.origin}/`,
			"Accept": "*/*"
		};
	} catch {
		return {
			"User-Agent": DEFAULT_USER_AGENT,
			"Accept": "*/*"
		};
	}
}

function getHeader(headers: Record<string, string>, headerName: string): string {
	const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === headerName.toLowerCase());
	return matchedKey ? headers[matchedKey] ?? "" : "";
}

function guessFileExtension(imageUrl: string, contentType: string): string {
	const normalizedContentType = contentType.toLowerCase();
	if (normalizedContentType.includes("jpeg")) return "jpg";
	if (normalizedContentType.includes("png")) return "png";
	if (normalizedContentType.includes("gif")) return "gif";
	if (normalizedContentType.includes("webp")) return "webp";
	if (normalizedContentType.includes("svg")) return "svg";
	if (normalizedContentType.includes("bmp")) return "bmp";

	try {
		const parsedUrl = new URL(imageUrl);
		const wxFormat = parsedUrl.searchParams.get("wx_fmt");
		if (wxFormat) {
			return wxFormat === "jpeg" ? "jpg" : wxFormat;
		}

		const match = parsedUrl.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
		if (match) {
			const extensionFromPath = match[1];
			if (extensionFromPath) {
				return extensionFromPath.toLowerCase();
			}
		}
	} catch {
		// Ignore parse failures and fall back to a generic extension.
	}

	return "img";
}

function getImageSource(imageElement: Element): string {
	const candidates = [
		imageElement.getAttribute("data-src"),
		imageElement.getAttribute("data-original"),
		imageElement.getAttribute("data-actualsrc"),
		imageElement.getAttribute("src")
	].filter(Boolean) as string[];

	for (const candidate of candidates) {
		if (candidate.startsWith("//")) {
			return `https:${candidate}`;
		}

		if (candidate.startsWith("http")) {
			return candidate;
		}
	}

	const srcset = imageElement.getAttribute("srcset");
	if (srcset) {
		const firstEntry = srcset.split(",")[0]?.trim().split(/\s+/)[0];
		if (firstEntry) {
			return firstEntry.startsWith("//") ? `https:${firstEntry}` : firstEntry;
		}
	}

	return "";
}

async function downloadAttachment(
	app: App,
	imageUrl: string,
	notePath: string,
	index: number,
	hint: string,
	cache: Map<string, DownloadedAttachment>
): Promise<DownloadedAttachment> {
	const cached = cache.get(imageUrl);
	if (cached) {
		return cached;
	}

	const response = await requestUrl({
		url: imageUrl,
		method: "GET",
		headers: getRequestHeaders(imageUrl),
		throw: false
	});

	if (response.status >= 400) {
		throw new Error(`Image request failed with status ${response.status} for ${imageUrl}`);
	}

	const extension = guessFileExtension(imageUrl, getHeader(response.headers, "content-type"));
	const fileStem = sanitizePathSegment(hint || `image ${String(index).padStart(3, "0")}`);
	const attachmentPath = await app.fileManager.getAvailablePathForAttachment(`${fileStem}.${extension}`, notePath);
	await ensureFolderExists(app, getParentFolder(attachmentPath));

	const file = await app.vault.createBinary(attachmentPath, response.arrayBuffer);
	const embedMarkdown = `!${app.fileManager.generateMarkdownLink(file, notePath)}`;
	const downloadedAttachment = { file, embedMarkdown };
	cache.set(imageUrl, downloadedAttachment);
	return downloadedAttachment;
}

export async function localizeImagesInElement(app: App, root: ParentNode, notePath: string): Promise<number> {
	const imageElements = Array.from(root.querySelectorAll("img"));
	if (imageElements.length === 0) {
		return 0;
	}

	const cache = new Map<string, DownloadedAttachment>();
	let index = 1;

	for (const imageElement of imageElements) {
		const imageUrl = getImageSource(imageElement);
		if (!imageUrl || imageUrl.startsWith("data:")) {
			continue;
		}

		const altText = imageElement.getAttribute("alt") || imageElement.getAttribute("data-alt") || "";
		try {
			const attachment = await downloadAttachment(app, imageUrl, notePath, index, altText || `image ${index}`, cache);
			imageElement.setAttribute("data-obsidian-embed", attachment.embedMarkdown);
			imageElement.setAttribute("src", attachment.file.path);
			imageElement.removeAttribute("srcset");
			index += 1;
		} catch {
			// Leave the original URL in place if the download fails.
		}
	}

	return cache.size;
}

export async function localizeExternalImagesInMarkdown(app: App, sourceFile: TFile, markdown: string): Promise<LocalizeMarkdownResult> {
	let updatedMarkdown = markdown;
	const cache = new Map<string, DownloadedAttachment>();
	let index = 1;

	for (const match of markdown.matchAll(MARKDOWN_IMAGE_REGEX)) {
		const fullMatch = match[0];
		const altText = match[1] || "";
		const imageUrl = match[2];
		if (!imageUrl) {
			continue;
		}

		try {
			const attachment = await downloadAttachment(app, imageUrl, sourceFile.path, index, altText || `image ${index}`, cache);
			updatedMarkdown = updatedMarkdown.replace(fullMatch, attachment.embedMarkdown);
			index += 1;
		} catch {
			// Keep the original image URL if the download fails.
		}
	}

	for (const match of markdown.matchAll(HTML_IMAGE_REGEX)) {
		const fullMatch = match[0];
		const imageUrl = match[1];
		if (!imageUrl) {
			continue;
		}

		try {
			const attachment = await downloadAttachment(app, imageUrl, sourceFile.path, index, `image ${index}`, cache);
			updatedMarkdown = updatedMarkdown.replace(fullMatch, attachment.embedMarkdown);
			index += 1;
		} catch {
			// Keep the original tag if the download fails.
		}
	}

	return {
		content: updatedMarkdown,
		downloadedImageCount: cache.size
	};
}

export async function localizeExternalImagesInActiveNote(app: App): Promise<number> {
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	const sourceFile = activeView?.file;

	if (!sourceFile) {
		throw new Error("Open a Markdown note first.");
	}

	const originalMarkdown = await app.vault.read(sourceFile);
	const result = await localizeExternalImagesInMarkdown(app, sourceFile, originalMarkdown);

	if (result.downloadedImageCount > 0 && result.content !== originalMarkdown) {
		await app.vault.modify(sourceFile, result.content);
	}

	return result.downloadedImageCount;
}

export async function localizeExternalImagesInFile(app: App, sourceFile: TFile): Promise<number> {
	const originalMarkdown = await app.vault.read(sourceFile);
	const result = await localizeExternalImagesInMarkdown(app, sourceFile, originalMarkdown);

	if (result.downloadedImageCount > 0 && result.content !== originalMarkdown) {
		await app.vault.modify(sourceFile, result.content);
	}

	return result.downloadedImageCount;
}
