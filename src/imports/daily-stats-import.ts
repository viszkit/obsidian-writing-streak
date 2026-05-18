import type { DailyRecord } from "../daily-progress";

export interface DailyStatsImportResult {
	imported: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDailyStatsDayCounts(raw: string): Record<string, number> {
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed) || !isRecord(parsed.dayCounts)) return {};

	const dayCounts: Record<string, number> = {};
	for (const [key, value] of Object.entries(parsed.dayCounts)) {
		if (typeof value === "number" && Number.isFinite(value)) {
			dayCounts[key] = value;
		}
	}
	return dayCounts;
}

export function dailyStatsKeyToDateKey(key: string): string | null {
	const parts = key.split("/");
	if (parts.length !== 3) return null;
	const year = parseInt(parts[0], 10);
	const month = parseInt(parts[1], 10) + 1;
	const day = parseInt(parts[2], 10);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function importDailyStatsHistory(
	history: Record<string, DailyRecord>,
	dayCounts: Record<string, number>,
	dailyGoal: number
): DailyStatsImportResult {
	let imported = 0;
	for (const [dailyStatsKey, words] of Object.entries(dayCounts)) {
		if (typeof words !== "number" || words <= 0) continue;
		const dateKey = dailyStatsKeyToDateKey(dailyStatsKey);
		if (!dateKey) continue;

		if (!history[dateKey] || history[dateKey].totalWords === 0) {
			history[dateKey] = {
				totalWords: words,
				goalMet: words >= dailyGoal,
				updatedAt: 0,
			};
			imported++;
		}
	}
	return { imported };
}
