import type { DailyRecord } from "./daily-progress";
import { dateToKey } from "./dates";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type StreakCardState = "idle" | "active" | "best-active";

export interface YearStats {
	total: number;
	days: number;
	avg: number;
}

export interface HeatmapCellState {
	words: number;
	level: number;
	goalMet: boolean;
}

export interface YearGridSlot {
	dayIndex: number;
	date: Date | null;
}

export function getStreakCardState(current: number, longest: number): StreakCardState {
	if (current <= 0) return "idle";
	return current === longest ? "best-active" : "active";
}

function intensityLevel(words: number, max: number): number {
	if (words === 0) return 0;
	const ratio = words / max;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

function historyKeysByPredicate(
	history: Record<string, DailyRecord>,
	matches: (record: DailyRecord) => boolean,
	year?: number
): string[] {
	return Object.entries(history)
		.filter(([key, rec]) => matches(rec) && (year === undefined || key.startsWith(`${year}-`)))
		.map(([key]) => key)
		.sort();
}

function previousDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() - 1);
	return dateToKey(date);
}

function calcCurrentStreakFromSet(keys: Set<string>, anchor: Date): number {
	let current = 0;
	let cursor = new Date(anchor);
	let skippedAnchor = false;

	while (true) {
		const key = dateToKey(cursor);
		if (keys.has(key)) {
			current++;
			cursor.setDate(cursor.getDate() - 1);
			continue;
		}
		if (current === 0 && !skippedAnchor) {
			skippedAnchor = true;
			cursor.setDate(cursor.getDate() - 1);
			continue;
		}
		return current;
	}
}

function calcLongestStreak(keys: string[]): number {
	let longest = 0;
	let streak = 0;
	let prev: string | null = null;

	for (const key of keys) {
		if (prev && previousDayKey(key) === prev) {
			streak++;
		} else {
			streak = 1;
		}
		if (streak > longest) longest = streak;
		prev = key;
	}

	return longest;
}

function calcStreaksFromKeys(keys: string[], year?: number): { current: number; longest: number } {
	if (keys.length === 0) return { current: 0, longest: 0 };

	const keySet = new Set(keys);
	const anchor = year === undefined || year === new Date().getFullYear()
		? new Date()
		: new Date(year, 11, 31);

	return {
		current: calcCurrentStreakFromSet(keySet, anchor),
		longest: calcLongestStreak(keys),
	};
}

export function calcStreaks(
	history: Record<string, DailyRecord>,
	matches: (record: DailyRecord) => boolean,
	year?: number
): { current: number; longest: number } {
	return calcStreaksFromKeys(historyKeysByPredicate(history, matches, year), year);
}

export function isWritingDay(record: DailyRecord): boolean {
	return record.totalWords > 0;
}

export function isGoalMetDay(record: DailyRecord): boolean {
	return record.goalMet === true;
}

export function yearMax(history: Record<string, DailyRecord>, year: number): number {
	let max = 1;
	for (const [key, rec] of Object.entries(history)) {
		if (key.startsWith(`${year}-`) && rec.totalWords > max) max = rec.totalWords;
	}
	return max;
}

export function yearStats(history: Record<string, DailyRecord>, year: number): YearStats {
	let total = 0, days = 0;
	for (const [key, rec] of Object.entries(history)) {
		if (!key.startsWith(`${year}-`)) continue;
		if (rec.totalWords > 0) { total += rec.totalWords; days++; }
	}
	return { total, days, avg: days > 0 ? Math.round(total / days) : 0 };
}

export function getMonthlySums(history: Record<string, DailyRecord>, year: number): number[] {
	const sums = Array.from({ length: 12 }, () => 0);
	for (const [key, rec] of Object.entries(history)) {
		if (!key.startsWith(`${year}-`)) continue;
		sums[parseInt(key.slice(5, 7), 10) - 1] += rec.totalWords;
	}
	return sums;
}

export function getHeatmapCellState(
	history: Record<string, DailyRecord>,
	date: Date,
	max: number
): HeatmapCellState {
	const key = dateToKey(date);
	const record = history[key];
	const words = record?.totalWords ?? 0;
	return {
		words,
		level: intensityLevel(words, max),
		goalMet: record?.goalMet === true,
	};
}

export function buildYearGrid(year: number): YearGridSlot[][] {
	const jan1 = new Date(year, 0, 1);
	const startDow = (jan1.getDay() + 6) % 7;
	const dec31 = new Date(year, 11, 31);
	const totalDays = Math.floor((dec31.getTime() - jan1.getTime()) / 86400000) + 1;
	const totalSlots = startDow + totalDays;
	const totalWeeks = Math.ceil(totalSlots / 7);

	const weeks: YearGridSlot[][] = [];
	for (let w = 0; w < totalWeeks; w++) {
		const week: YearGridSlot[] = [];
		for (let dow = 0; dow < 7; dow++) {
			const di = w * 7 + dow - startDow;
			if (di < 0 || di >= totalDays) {
				week.push({ dayIndex: -1, date: null });
			} else {
				week.push({ dayIndex: di, date: new Date(year, 0, 1 + di) });
			}
		}
		weeks.push(week);
	}
	return weeks;
}
