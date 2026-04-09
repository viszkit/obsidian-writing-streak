"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyActiveDay = createEmptyActiveDay;
exports.normalizeActiveDay = normalizeActiveDay;
exports.updateFileProgress = updateFileProgress;
exports.mergeFileProgress = mergeFileProgress;
exports.mergeActiveDay = mergeActiveDay;
exports.renameFileProgress = renameFileProgress;
exports.getTodayTotal = getTodayTotal;
const DEBUG_PROGRESS_DIAGNOSTICS = false;
function logProgressDiagnostic(event, details) {
    if (!DEBUG_PROGRESS_DIAGNOSTICS)
        return;
    console.debug(`[word-goal][daily-progress] ${event}`, details);
}
function createEmptyActiveDay(date) {
    return { date, files: {} };
}
function normalizeActiveDay(date, value) {
    const normalized = {
        date: typeof value?.date === "string" && value.date.length > 0 ? value.date : date,
        files: {},
    };
    for (const [path, file] of Object.entries(value?.files ?? {})) {
        if (!file || typeof file !== "object")
            continue;
        const latestCandidate = typeof file.latestWords === "number" && Number.isFinite(file.latestWords)
            ? file.latestWords
            : 0;
        const baselineWords = typeof file.baselineWords === "number" && Number.isFinite(file.baselineWords)
            ? file.baselineWords
            : latestCandidate;
        normalized.files[path] = {
            baselineWords,
            latestWords: Math.max(baselineWords, latestCandidate),
            latestObservedAt: typeof file.latestObservedAt === "number" && Number.isFinite(file.latestObservedAt)
                ? file.latestObservedAt
                : 0,
        };
        logProgressDiagnostic("normalize-file-progress", {
            path,
            rawBaselineWords: file.baselineWords,
            rawLatestWords: file.latestWords,
            baselineWords,
            latestWords: normalized.files[path].latestWords,
        });
    }
    return normalized;
}
function updateFileProgress(activeDay, dateKey, path, words, observedAt, baselineOverride) {
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
        logProgressDiagnostic("create-file-progress", {
            path,
            words: normalizedWords,
            observedAt,
            baselineOverride,
            baselineWords,
        });
        return next;
    }
    next.files[path] = {
        baselineWords: existing.baselineWords,
        latestWords: normalizedWords,
        latestObservedAt: Math.max(existing.latestObservedAt, observedAt),
    };
    logProgressDiagnostic("update-file-progress", {
        path,
        words: normalizedWords,
        observedAt,
        existingBaselineWords: existing.baselineWords,
        existingLatestWords: existing.latestWords,
        nextLatestWords: next.files[path].latestWords,
    });
    return next;
}
function chooseMergedBaseline(local, incoming) {
    const localLooksLikePartial = local.baselineWords === 0 && local.latestWords === incoming.latestWords && incoming.baselineWords > 0;
    const incomingLooksLikePartial = incoming.baselineWords === 0 && incoming.latestWords === local.latestWords && local.baselineWords > 0;
    const localLooksLikeEmptySnapshot = local.baselineWords === 0 && local.latestWords === 0 && incoming.baselineWords > 0;
    const incomingLooksLikeEmptySnapshot = incoming.baselineWords === 0 && incoming.latestWords === 0 && local.baselineWords > 0;
    if (localLooksLikePartial || localLooksLikeEmptySnapshot) {
        return incoming.baselineWords;
    }
    if (incomingLooksLikePartial || incomingLooksLikeEmptySnapshot) {
        return local.baselineWords;
    }
    return Math.min(local.baselineWords, incoming.baselineWords);
}
function mergeFileProgress(local, incoming) {
    if (!local)
        return incoming ? { ...incoming } : undefined;
    if (!incoming)
        return { ...local };
    const localTimestamp = local.latestObservedAt ?? 0;
    const incomingTimestamp = incoming.latestObservedAt ?? 0;
    const latest = incomingTimestamp > localTimestamp ? incoming.latestWords : local.latestWords;
    const baselineWords = chooseMergedBaseline(local, incoming);
    logProgressDiagnostic("merge-file-progress", {
        local,
        incoming,
        baselineWords,
        latestWords: Math.max(0, latest),
    });
    return {
        baselineWords,
        latestWords: Math.max(0, latest),
        latestObservedAt: Math.max(localTimestamp, incomingTimestamp),
    };
}
function mergeActiveDay(local, incoming, today) {
    if (incoming.date !== today)
        return normalizeActiveDay(today, local.date === today ? local : createEmptyActiveDay(today));
    const base = local.date === today ? normalizeActiveDay(today, local) : createEmptyActiveDay(today);
    for (const [path, progress] of Object.entries(incoming.files)) {
        const merged = mergeFileProgress(base.files[path], progress);
        if (merged)
            base.files[path] = merged;
    }
    return base;
}
function renameFileProgress(activeDay, oldPath, newPath) {
    if (oldPath === newPath)
        return activeDay;
    const next = normalizeActiveDay(activeDay.date, activeDay);
    const existing = next.files[oldPath];
    if (!existing)
        return next;
    next.files[newPath] = mergeFileProgress(next.files[newPath], existing) ?? existing;
    delete next.files[oldPath];
    return next;
}
function getTodayTotal(activeDay) {
    let total = 0;
    for (const progress of Object.values(activeDay.files)) {
        total += Math.max(progress.latestWords - progress.baselineWords, 0);
    }
    return total;
}
