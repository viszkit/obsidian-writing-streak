import * as moment from "moment";
import type { DailyRecord } from "./daily-progress";

export interface DailyNotePathConfig {
	format: string;
	folder: string;
}

export interface DailyNoteImportResult {
	imported: number;
	skipped: number;
	scanned: number;
}

function normalizeVaultPath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

function stripMarkdownExtension(path: string): string {
	return path.replace(/\.md$/i, "");
}

function parseDateKey(value: string, format: string): string | null {
	const momentModule = moment as unknown as { default?: unknown };
	const parseMoment = (momentModule.default ?? moment) as (input: string, format: string, strict: boolean) => {
		isValid(): boolean;
		format(format: string): string;
	};
	const parsed = parseMoment(value, format, true);
	if (!parsed.isValid()) return null;
	if (parsed.format(format) !== value) return null;
	return parsed.format("YYYY-MM-DD");
}

export function dailyNotePathToDateKey(path: string, config: DailyNotePathConfig): string | null {
	const normalizedPath = normalizeVaultPath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) return null;

	const folder = normalizeVaultPath(config.folder);
	if (folder.length > 0 && !normalizedPath.startsWith(`${folder}/`)) return null;

	const relativePath = folder.length > 0
		? normalizedPath.slice(folder.length + 1)
		: normalizedPath;
	const normalizedFormat = normalizeVaultPath(config.format);
	if (relativePath.length === 0 || normalizedFormat.length === 0) return null;

	const candidates = [{
		value: stripMarkdownExtension(relativePath),
		format: stripMarkdownExtension(normalizedFormat),
	}];

	for (const candidate of candidates) {
		const dateKey = parseDateKey(candidate.value, candidate.format);
		if (dateKey) return dateKey;
	}
	return null;
}

export function applyImportedDailyWordCount(
	history: Record<string, DailyRecord>,
	dateKey: string,
	words: number,
	dailyGoal: number,
	updatedAt: number
): boolean {
	const totalWords = Math.max(0, Math.floor(words));
	if (totalWords <= 0) return false;

	const existing = history[dateKey];
	if (existing && existing.totalWords >= totalWords) return false;

	history[dateKey] = {
		totalWords,
		goalMet: existing?.goalMet === true || totalWords >= dailyGoal,
		updatedAt,
	};
	return true;
}
