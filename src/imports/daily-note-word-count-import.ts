import type { App } from "obsidian";
import { countMeaningfulWords } from "../counting";
import { applyImportedDailyWordCount, dailyNotePathToDateKey } from "../daily-note-import";
import { resolveDailyNotePathConfig } from "../daily-notes";
import type { DailyRecord } from "../daily-progress";

export interface DailyNoteWordCountImportResult {
	imported: number;
	skipped: number;
	scanned: number;
}

export async function importDailyNoteWordCounts(
	app: App,
	history: Record<string, DailyRecord>,
	dailyGoal: number,
	updatedAt = Date.now()
): Promise<DailyNoteWordCountImportResult | null> {
	const config = await resolveDailyNotePathConfig(app);
	if (!config) return null;

	let scanned = 0;
	let imported = 0;
	let skipped = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		const dateKey = dailyNotePathToDateKey(file.path, config);
		if (!dateKey) continue;
		scanned++;

		const content = await app.vault.cachedRead(file);
		const words = countMeaningfulWords(content, app.metadataCache.getCache(file.path));
		if (applyImportedDailyWordCount(history, dateKey, words, dailyGoal, updatedAt)) {
			imported++;
		} else {
			skipped++;
		}
	}

	return { imported, skipped, scanned };
}
