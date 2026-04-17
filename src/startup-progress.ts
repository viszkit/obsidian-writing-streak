import {
	createEmptyActiveDay,
	normalizeActiveDay,
	type ActiveDayData,
	type ActiveDayFileProgress,
} from "./daily-progress";

export interface StoredBaselineSnapshotResult {
	activeDay: ActiveDayData;
	initialized: boolean;
	repaired: boolean;
	nextLastObservedWords: number;
}

function normalizeWordCount(words: number | undefined): number {
	return typeof words === "number" && Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}

export function shouldRepairStoredBaseline(
	existing: ActiveDayFileProgress | undefined,
	storedWords: number
): boolean {
	if (!existing) return false;
	const normalizedStoredWords = normalizeWordCount(storedWords);
	return normalizedStoredWords < existing.baselineWords && existing.latestWords === existing.baselineWords;
}

export function applyStoredBaselineSnapshot(
	activeDay: ActiveDayData,
	dateKey: string,
	path: string,
	storedWords: number,
	observedAt: number,
	liveWords?: number
): StoredBaselineSnapshotResult {
	const normalizedStoredWords = normalizeWordCount(storedWords);
	const normalizedLiveWords = normalizeWordCount(liveWords);
	const next = activeDay.date === dateKey ? normalizeActiveDay(dateKey, activeDay) : createEmptyActiveDay(dateKey);
	const existing = next.files[path];

	if (!existing) {
		next.files[path] = {
			baselineWords: normalizedStoredWords,
			latestWords: normalizedStoredWords,
			latestObservedAt: observedAt,
		};
		return {
			activeDay: next,
			initialized: true,
			repaired: false,
			nextLastObservedWords: liveWords === undefined ? normalizedStoredWords : normalizedLiveWords,
		};
	}

	if (shouldRepairStoredBaseline(existing, normalizedStoredWords)) {
		next.files[path] = {
			baselineWords: normalizedStoredWords,
			latestWords: Math.max(normalizedStoredWords, existing.latestWords > existing.baselineWords ? existing.latestWords : normalizedStoredWords),
			latestObservedAt: Math.max(existing.latestObservedAt, observedAt),
		};
		return {
			activeDay: next,
			initialized: false,
			repaired: true,
			nextLastObservedWords: Math.max(existing.latestWords, normalizedLiveWords),
		};
	}

	return {
		activeDay: next,
		initialized: false,
		repaired: false,
		nextLastObservedWords: Math.max(existing.latestWords, normalizedLiveWords),
	};
}
