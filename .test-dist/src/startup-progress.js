"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRepairStoredBaseline = shouldRepairStoredBaseline;
exports.applyStoredBaselineSnapshot = applyStoredBaselineSnapshot;
const daily_progress_1 = require("./daily-progress");
function normalizeWordCount(words) {
    return typeof words === "number" && Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}
function shouldRepairStoredBaseline(existing, storedWords) {
    if (!existing)
        return false;
    const normalizedStoredWords = normalizeWordCount(storedWords);
    return normalizedStoredWords < existing.baselineWords && existing.latestWords === existing.baselineWords;
}
function applyStoredBaselineSnapshot(activeDay, dateKey, path, storedWords, observedAt, liveWords) {
    const normalizedStoredWords = normalizeWordCount(storedWords);
    const normalizedLiveWords = normalizeWordCount(liveWords);
    const next = activeDay.date === dateKey ? (0, daily_progress_1.normalizeActiveDay)(dateKey, activeDay) : (0, daily_progress_1.createEmptyActiveDay)(dateKey);
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
