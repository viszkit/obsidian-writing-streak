export interface ActiveDayFileProgress {
	baselineWords: number;
	latestWords: number;
	latestObservedAt: number;
}

export interface ActiveDayData {
	date: string;
	files: Record<string, ActiveDayFileProgress>;
}

export interface DailyRecord {
	totalWords: number;
	goalMet?: boolean;
	updatedAt?: number;
}

export function createEmptyActiveDay(date: string): ActiveDayData {
	return { date, files: {} };
}

export function normalizeActiveDay(date: string, value?: Partial<ActiveDayData> | null): ActiveDayData {
	const normalized: ActiveDayData = {
		date: typeof value?.date === "string" && value.date.length > 0 ? value.date : date,
		files: {},
	};
	for (const [path, file] of Object.entries(value?.files ?? {})) {
		if (!file || typeof file !== "object") continue;
		const baselineWords = typeof file.baselineWords === "number" && Number.isFinite(file.baselineWords)
			? file.baselineWords
			: 0;
		const latestCandidate = typeof file.latestWords === "number" && Number.isFinite(file.latestWords)
			? file.latestWords
			: baselineWords;
		normalized.files[path] = {
			baselineWords,
			latestWords: Math.max(baselineWords, latestCandidate),
			latestObservedAt: typeof file.latestObservedAt === "number" && Number.isFinite(file.latestObservedAt)
				? file.latestObservedAt
				: 0,
		};
	}
	return normalized;
}

export function updateFileProgress(
	activeDay: ActiveDayData,
	dateKey: string,
	path: string,
	words: number,
	observedAt: number,
	baselineOverride?: number
): ActiveDayData {
	const normalizedWords = Math.max(0, Math.floor(words));
	const next = activeDay.date === dateKey ? normalizeActiveDay(dateKey, activeDay) : createEmptyActiveDay(dateKey);
	const existing = next.files[path];
	if (!existing) {
		const baselineWords = typeof baselineOverride === "number" && Number.isFinite(baselineOverride)
			? Math.max(0, Math.floor(baselineOverride))
			: normalizedWords;
		next.files[path] = {
			baselineWords,
			latestWords: normalizedWords,
			latestObservedAt: observedAt,
		};
		return next;
	}
	next.files[path] = {
		baselineWords: existing.baselineWords,
		latestWords: normalizedWords,
		latestObservedAt: Math.max(existing.latestObservedAt, observedAt),
	};
	return next;
}

export function mergeFileProgress(
	local: ActiveDayFileProgress | undefined,
	incoming: ActiveDayFileProgress | undefined
): ActiveDayFileProgress | undefined {
	if (!local) return incoming ? { ...incoming } : undefined;
	if (!incoming) return { ...local };
	const localTimestamp = local.latestObservedAt ?? 0;
	const incomingTimestamp = incoming.latestObservedAt ?? 0;
	const latest = incomingTimestamp > localTimestamp ? incoming.latestWords : local.latestWords;
	return {
		baselineWords: Math.min(local.baselineWords, incoming.baselineWords),
		latestWords: Math.max(0, latest),
		latestObservedAt: Math.max(localTimestamp, incomingTimestamp),
	};
}

export function mergeActiveDay(local: ActiveDayData, incoming: ActiveDayData, today: string): ActiveDayData {
	if (incoming.date !== today) return normalizeActiveDay(today, local.date === today ? local : createEmptyActiveDay(today));
	const base = local.date === today ? normalizeActiveDay(today, local) : createEmptyActiveDay(today);
	for (const [path, progress] of Object.entries(incoming.files)) {
		const merged = mergeFileProgress(base.files[path], progress);
		if (merged) base.files[path] = merged;
	}
	return base;
}

export function renameFileProgress(activeDay: ActiveDayData, oldPath: string, newPath: string): ActiveDayData {
	if (oldPath === newPath) return activeDay;
	const next = normalizeActiveDay(activeDay.date, activeDay);
	const existing = next.files[oldPath];
	if (!existing) return next;
	next.files[newPath] = mergeFileProgress(next.files[newPath], existing) ?? existing;
	delete next.files[oldPath];
	return next;
}

export function getTodayTotal(activeDay: ActiveDayData): number {
	let total = 0;
	for (const progress of Object.values(activeDay.files)) {
		total += Math.max(progress.latestWords - progress.baselineWords, 0);
	}
	return total;
}
