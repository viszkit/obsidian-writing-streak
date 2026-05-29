import {
	createEmptyActiveDay,
	getTodayTotal,
	normalizeActiveDay,
	recordFileObservation,
	removeFileProgress,
	renameFileProgress,
	type ActiveDayData,
	type ActiveDayFileProgress,
} from "./daily-progress";

export interface TrackingState {
	activeDay: ActiveDayData;
	lastObservedWordsByPath: Map<string, number>;
}

export interface DayRolloverResult {
	state: TrackingState;
	previousDate: string | null;
	previousTotal: number;
	changed: boolean;
}

export interface BaselineInitializationResult {
	state: TrackingState;
	initialized: boolean;
	repaired: boolean;
	nextLastObservedWords: number;
}

export interface FileObservationResult {
	state: TrackingState;
	changed: boolean;
	duplicate: boolean;
}

export interface FileRenameResult {
	state: TrackingState;
	changed: boolean;
}

export interface FileRemovalResult {
	state: TrackingState;
	changed: boolean;
}

function normalizeWordCount(words: number | undefined): number {
	return typeof words === "number" && Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}

function cloneLastObserved(lastObservedWordsByPath: Map<string, number>): Map<string, number> {
	return new Map(lastObservedWordsByPath);
}

export function createTrackingState(activeDay: ActiveDayData): TrackingState {
	return {
		activeDay: normalizeActiveDay(activeDay.date, activeDay),
		lastObservedWordsByPath: new Map(),
	};
}

export function getTrackingTotal(state: TrackingState): number {
	return getTodayTotal(state.activeDay);
}

export function rollTrackingStateToDate(state: TrackingState, dateKey: string): DayRolloverResult {
	if (state.activeDay.date === dateKey) {
		return {
			state,
			previousDate: null,
			previousTotal: 0,
			changed: false,
		};
	}

	const previousDate = state.activeDay.date || null;
	const previousTotal = previousDate ? getTodayTotal(state.activeDay) : 0;
	return {
		state: {
			activeDay: createEmptyActiveDay(dateKey),
			lastObservedWordsByPath: new Map(),
		},
		previousDate,
		previousTotal,
		changed: true,
	};
}

export function hasDuplicateObservation(state: TrackingState, path: string, words: number): boolean {
	const normalizedWords = normalizeWordCount(words);
	return state.lastObservedWordsByPath.get(path) === normalizedWords
		&& state.activeDay.files[path]?.latestWords === normalizedWords;
}

export function recordObservedFileWords(
	state: TrackingState,
	dateKey: string,
	path: string,
	words: number,
	observedAt: number
): FileObservationResult {
	const normalizedWords = normalizeWordCount(words);
	const currentState = state.activeDay.date === dateKey ? state : rollTrackingStateToDate(state, dateKey).state;
	if (hasDuplicateObservation(currentState, path, normalizedWords)) {
		return { state: currentState, changed: false, duplicate: true };
	}

	const existing = currentState.activeDay.files[path];
	const previousWords = currentState.lastObservedWordsByPath.get(path);
	const baselineOverride = existing ? undefined : previousWords;
	const activeDay = recordFileObservation(
		currentState.activeDay,
		dateKey,
		path,
		normalizedWords,
		observedAt,
		baselineOverride
	);
	const lastObservedWordsByPath = cloneLastObserved(currentState.lastObservedWordsByPath);
	lastObservedWordsByPath.set(path, normalizedWords);

	return {
		state: { activeDay, lastObservedWordsByPath },
		changed: true,
		duplicate: false,
	};
}

export function shouldRepairStoredBaseline(
	existing: ActiveDayFileProgress | undefined,
	storedWords: number
): boolean {
	if (!existing) return false;
	const normalizedStoredWords = normalizeWordCount(storedWords);
	return normalizedStoredWords < existing.baselineWords && existing.latestWords === existing.baselineWords;
}

export function initializeFileBaselineFromStoredSnapshot(
	state: TrackingState,
	dateKey: string,
	path: string,
	storedWords: number,
	observedAt: number,
	liveWords?: number
): BaselineInitializationResult {
	const normalizedStoredWords = normalizeWordCount(storedWords);
	const normalizedLiveWords = normalizeWordCount(liveWords);
	const currentState = state.activeDay.date === dateKey ? state : rollTrackingStateToDate(state, dateKey).state;
	const activeDay = normalizeActiveDay(dateKey, currentState.activeDay);
	const existing = activeDay.files[path];
	const lastObservedWordsByPath = cloneLastObserved(currentState.lastObservedWordsByPath);

	if (!existing) {
		activeDay.files[path] = {
			baselineWords: normalizedStoredWords,
			latestWords: normalizedStoredWords,
			latestObservedAt: observedAt,
		};
		lastObservedWordsByPath.set(path, liveWords === undefined ? normalizedStoredWords : normalizedLiveWords);
		return {
			state: { activeDay, lastObservedWordsByPath },
			initialized: true,
			repaired: false,
			nextLastObservedWords: liveWords === undefined ? normalizedStoredWords : normalizedLiveWords,
		};
	}

	if (shouldRepairStoredBaseline(existing, normalizedStoredWords)) {
		activeDay.files[path] = {
			baselineWords: normalizedStoredWords,
			latestWords: Math.max(
				normalizedStoredWords,
				existing.latestWords > existing.baselineWords ? existing.latestWords : normalizedStoredWords
			),
			latestObservedAt: Math.max(existing.latestObservedAt, observedAt),
		};
		const nextLastObservedWords = Math.max(existing.latestWords, normalizedLiveWords);
		lastObservedWordsByPath.set(path, nextLastObservedWords);
		return {
			state: { activeDay, lastObservedWordsByPath },
			initialized: false,
			repaired: true,
			nextLastObservedWords,
		};
	}

	const nextLastObservedWords = Math.max(existing.latestWords, normalizedLiveWords);
	lastObservedWordsByPath.set(path, nextLastObservedWords);
	return {
		state: { activeDay, lastObservedWordsByPath },
		initialized: false,
		repaired: false,
		nextLastObservedWords,
	};
}

export function renameTrackedFile(state: TrackingState, oldPath: string, newPath: string): FileRenameResult {
	if (oldPath === newPath) return { state, changed: false };

	const activeDay = renameFileProgress(state.activeDay, oldPath, newPath);
	const lastObservedWordsByPath = cloneLastObserved(state.lastObservedWordsByPath);
	const previousWords = lastObservedWordsByPath.get(oldPath);
	if (previousWords !== undefined) {
		lastObservedWordsByPath.delete(oldPath);
		lastObservedWordsByPath.set(newPath, previousWords);
	}

	return {
		state: { activeDay, lastObservedWordsByPath },
		changed: activeDay !== state.activeDay || previousWords !== undefined,
	};
}

export function removeTrackedFile(state: TrackingState, path: string): FileRemovalResult {
	const activeDay = removeFileProgress(state.activeDay, path);
	const lastObservedWordsByPath = cloneLastObserved(state.lastObservedWordsByPath);
	const hadObservedWords = lastObservedWordsByPath.delete(path);

	return {
		state: { activeDay, lastObservedWordsByPath },
		changed: activeDay !== state.activeDay || hadObservedWords,
	};
}

export function removeTrackedFilesWhere(
	state: TrackingState,
	shouldRemove: (path: string) => boolean
): FileRemovalResult {
	let nextState = state;
	let changed = false;
	const paths = new Set([
		...Object.keys(state.activeDay.files),
		...state.lastObservedWordsByPath.keys(),
	]);

	for (const path of paths) {
		if (!shouldRemove(path)) continue;
		const result = removeTrackedFile(nextState, path);
		nextState = result.state;
		changed = result.changed || changed;
	}

	return { state: nextState, changed };
}
