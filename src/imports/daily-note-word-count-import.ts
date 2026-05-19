import type { App, TFile } from "obsidian";
import { countMeaningfulWords } from "../counting";
import { applyImportedDailyWordCount, buildDailyNoteImportDateKeys, buildDailyNotePathForDate } from "../daily-note-import";
import { resolveDailyNotePathConfig } from "../daily-notes";
import type { DailyRecord } from "../daily-progress";

export interface DailyNoteWordCountImportResult {
	imported: number;
	missing: number;
	skipped: number;
	checked: number;
	startDate: string;
	endDate: string;
}

export interface DailyNoteWordCountImportRange {
	startDate: string;
	endDate: string;
}

function isMarkdownFile(file: unknown): file is TFile {
	return typeof file === "object" &&
		file !== null &&
		"path" in file &&
		"extension" in file &&
		typeof (file as { path?: unknown }).path === "string" &&
		(file as { extension?: unknown }).extension === "md";
}

export async function importDailyNoteWordCounts(
	app: App,
	history: Record<string, DailyRecord>,
	dailyGoal: number,
	range: DailyNoteWordCountImportRange,
	updatedAt = Date.now()
): Promise<DailyNoteWordCountImportResult | null> {
	const config = await resolveDailyNotePathConfig(app);
	if (!config) return null;

	const dateKeys = buildDailyNoteImportDateKeys(range.startDate, range.endDate);

	let checked = 0;
	let imported = 0;
	let missing = 0;
	let skipped = 0;
	for (const dateKey of dateKeys) {
		checked++;
		const path = buildDailyNotePathForDate(new Date(`${dateKey}T00:00:00`), config);
		if (!path) {
			missing++;
			continue;
		}

		const file = app.vault.getAbstractFileByPath(path);
		if (!isMarkdownFile(file)) {
			missing++;
			continue;
		}

		const content = await app.vault.cachedRead(file);
		const words = countMeaningfulWords(content, app.metadataCache.getCache(file.path));
		if (applyImportedDailyWordCount(history, dateKey, words, dailyGoal, updatedAt)) {
			imported++;
		} else {
			skipped++;
		}
	}

	return {
		imported,
		missing,
		skipped,
		checked,
		startDate: dateKeys[0],
		endDate: dateKeys[dateKeys.length - 1],
	};
}
