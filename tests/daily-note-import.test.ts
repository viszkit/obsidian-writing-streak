import test from "node:test";
import assert from "node:assert/strict";
import { applyImportedDailyWordCount, dailyNotePathToDateKey } from "../src/daily-note-import";
import type { DailyRecord } from "../src/daily-progress";

test("dailyNotePathToDateKey matches configured folder and format", () => {
	assert.equal(
		dailyNotePathToDateKey("Journal/2026-05-18.md", { folder: "Journal", format: "YYYY-MM-DD" }),
		"2026-05-18"
	);
});

test("dailyNotePathToDateKey ignores non-markdown files", () => {
	assert.equal(
		dailyNotePathToDateKey("Journal/2026-05-18.txt", { folder: "Journal", format: "YYYY-MM-DD" }),
		null
	);
});

test("dailyNotePathToDateKey ignores markdown files outside configured folder", () => {
	assert.equal(
		dailyNotePathToDateKey("Archive/2026-05-18.md", { folder: "Journal", format: "YYYY-MM-DD" }),
		null
	);
});

test("dailyNotePathToDateKey handles nested daily note formats", () => {
	assert.equal(
		dailyNotePathToDateKey("Journal/2026/05/18.md", { folder: "Journal", format: "YYYY/MM/DD" }),
		"2026-05-18"
	);
});

test("dailyNotePathToDateKey supports formats that include the markdown extension", () => {
	assert.equal(
		dailyNotePathToDateKey("Journal/2026-05-18.md", { folder: "Journal", format: "YYYY-MM-DD.md" }),
		"2026-05-18"
	);
});

test("applyImportedDailyWordCount imports missing day", () => {
	const history: Record<string, DailyRecord> = {};
	const changed = applyImportedDailyWordCount(history, "2026-05-18", 120, 500, 10);
	assert.equal(changed, true);
	assert.deepEqual(history["2026-05-18"], {
		totalWords: 120,
		goalMet: false,
		updatedAt: 10,
	});
});

test("applyImportedDailyWordCount replaces lower existing count", () => {
	const history: Record<string, DailyRecord> = {
		"2026-05-18": { totalWords: 100, goalMet: false, updatedAt: 1 },
	};
	const changed = applyImportedDailyWordCount(history, "2026-05-18", 250, 500, 10);
	assert.equal(changed, true);
	assert.equal(history["2026-05-18"].totalWords, 250);
	assert.equal(history["2026-05-18"].goalMet, false);
});

test("applyImportedDailyWordCount preserves higher existing count", () => {
	const history: Record<string, DailyRecord> = {
		"2026-05-18": { totalWords: 300, goalMet: false, updatedAt: 1 },
	};
	const changed = applyImportedDailyWordCount(history, "2026-05-18", 250, 500, 10);
	assert.equal(changed, false);
	assert.equal(history["2026-05-18"].totalWords, 300);
});

test("applyImportedDailyWordCount updates goalMet from daily goal", () => {
	const history: Record<string, DailyRecord> = {
		"2026-05-18": { totalWords: 300, goalMet: false, updatedAt: 1 },
	};
	const changed = applyImportedDailyWordCount(history, "2026-05-18", 500, 500, 10);
	assert.equal(changed, true);
	assert.equal(history["2026-05-18"].goalMet, true);
});

test("applyImportedDailyWordCount preserves existing goalMet true", () => {
	const history: Record<string, DailyRecord> = {
		"2026-05-18": { totalWords: 300, goalMet: true, updatedAt: 1 },
	};
	const changed = applyImportedDailyWordCount(history, "2026-05-18", 400, 500, 10);
	assert.equal(changed, true);
	assert.equal(history["2026-05-18"].goalMet, true);
});
