function normalizeWordCount(words: number): number {
	return Number.isFinite(words) ? Math.max(0, Math.floor(words)) : 0;
}

export function resolveInitialSnapshotWords(editorWords: number, storedWords: number): number {
	void editorWords;
	const normalizedStoredWords = normalizeWordCount(storedWords);
	return normalizedStoredWords;
}
