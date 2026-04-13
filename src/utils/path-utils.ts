import { App, normalizePath } from "obsidian";

const MAX_SEGMENT_LENGTH = 120;

export function cleanText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function sanitizePathSegment(value: string): string {
	const sanitized = cleanText(value)
		.replace(/[\\/:*?"<>|#^]/g, " ")
		.replace(/[[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	return (sanitized || "untitled").slice(0, MAX_SEGMENT_LENGTH);
}

export function getParentFolder(path: string): string {
	const normalized = normalizePath(path);
	const slashIndex = normalized.lastIndexOf("/");
	return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
}

export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalizedFolderPath = normalizePath(folderPath).trim();
	if (!normalizedFolderPath) {
		return;
	}

	const segments = normalizedFolderPath.split("/").filter(Boolean);
	let currentPath = "";

	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(currentPath)) {
			await app.vault.createFolder(currentPath);
		}
	}
}

export async function getAvailableNotePath(app: App, folderPath: string, baseName: string): Promise<string> {
	const safeBaseName = sanitizePathSegment(baseName);
	const normalizedFolderPath = folderPath.trim() ? normalizePath(folderPath) : "";
	const initialPath = normalizePath(normalizedFolderPath ? `${normalizedFolderPath}/${safeBaseName}.md` : `${safeBaseName}.md`);

	if (!app.vault.getAbstractFileByPath(initialPath)) {
		return initialPath;
	}

	let counter = 2;
	while (true) {
		const candidatePath = normalizePath(
			normalizedFolderPath ? `${normalizedFolderPath}/${safeBaseName} ${counter}.md` : `${safeBaseName} ${counter}.md`
		);

		if (!app.vault.getAbstractFileByPath(candidatePath)) {
			return candidatePath;
		}

		counter += 1;
	}
}
