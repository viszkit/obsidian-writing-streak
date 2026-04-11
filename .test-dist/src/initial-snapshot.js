"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInitialSnapshotWords = resolveInitialSnapshotWords;
function normalizeWordCount(words) {
    return Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}
function resolveInitialSnapshotWords(editorWords, storedWords) {
    const normalizedEditorWords = normalizeWordCount(editorWords);
    const normalizedStoredWords = normalizeWordCount(storedWords);
    if (normalizedEditorWords === 0 && normalizedStoredWords > 0) {
        return normalizedStoredWords;
    }
    return normalizedEditorWords;
}
