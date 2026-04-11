function normalizeWordCount(words: number): number {
	return Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}

export function resolveInitialSnapshotWords(editorWords: number, storedWords: number): number {
	const normalizedEditorWords = normalizeWordCount(editorWords);
	const normalizedStoredWords = normalizeWordCount(storedWords);
	if (normalizedEditorWords === 0 && normalizedStoredWords > 0) {
		return normalizedStoredWords;
	}
	return normalizedEditorWords;
}
