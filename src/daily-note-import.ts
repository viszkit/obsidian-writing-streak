import { moment } from "obsidian";
import type { DailyRecord } from "./daily-progress";

type MomentFormatter = (input: Date) => { format(format: string): string };

export interface DailyNotePathConfig {
	format: string;
	folder: string;
}

export interface DailyNoteImportResult {
	imported: number;
	skipped: number;
	checked: number;
	missing: number;
}

function dateToKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseDateKeyValue(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function buildDailyNoteImportDateKeys(startDate: string, endDate: string): string[] {
	const start = parseDateKeyValue(startDate);
	const end = parseDateKeyValue(endDate);
	if (!start || !end || start > end) {
		throw new Error("Invalid daily note import date range.");
	}

	const dates: string[] = [];
	for (let date = start; date <= end; date = addDays(date, 1)) {
		dates.push(dateToKey(date));
	}
	return dates;
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

export function buildDailyNotePathForDate(date: Date, config: DailyNotePathConfig): string | null {
	if (config.format.trim().length === 0) return null;

	const normalizedFormat = stripMarkdownExtension(normalizeVaultPath(config.format));
	const formatMoment = moment as unknown as MomentFormatter;
	const formattedPath = formatMoment(date).format(normalizedFormat);
	if (formattedPath.trim().length === 0) return null;

	const combinedPath = config.folder
		? normalizeVaultPath(`${config.folder}/${formattedPath}`)
		: normalizeVaultPath(formattedPath);

	return combinedPath.endsWith(".md") ? combinedPath : `${combinedPath}.md`;
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
