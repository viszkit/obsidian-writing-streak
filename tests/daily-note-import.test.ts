import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	applyImportedDailyWordCount,
	buildDailyNoteImportDateKeys,
	buildDailyNotePathForDate,
	dailyNotePathToDateKey,
} from "../src/daily-note-import";
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

test("buildDailyNotePathForDate creates one configured path for a date", () => {
	assert.equal(
		buildDailyNotePathForDate(new Date(2026, 4, 18), { folder: "Journal", format: "YYYY/MM/DD" }),
		"Journal/2026/05/18.md"
	);
});

test("buildDailyNotePathForDate does not append markdown extension twice", () => {
	assert.equal(
		buildDailyNotePathForDate(new Date(2026, 4, 18), { folder: "Journal", format: "YYYY-MM-DD.md" }),
		"Journal/2026-05-18.md"
	);
});

test("buildDailyNoteImportDateKeys includes only the selected date range", () => {
	assert.deepEqual(
		buildDailyNoteImportDateKeys("2026-05-18", "2026-05-20"),
		["2026-05-18", "2026-05-19", "2026-05-20"]
	);
});

test("buildDailyNoteImportDateKeys rejects invalid and reversed ranges", () => {
	assert.throws(() => buildDailyNoteImportDateKeys("2026-02-31", "2026-03-01"));
	assert.throws(() => buildDailyNoteImportDateKeys("2026-05-20", "2026-05-18"));
});

test("daily note import uses exact path lookup instead of vault-wide markdown enumeration", () => {
	const source = readFileSync("src/imports/daily-note-word-count-import.ts", "utf8");
	const vaultWideEnumerationPattern = new RegExp([
		"getMarkdown" + "Files",
		"get" + "Files\\(",
	].join("|"));
	assert.match(source, /getAbstractFileByPath/);
	assert.doesNotMatch(source, vaultWideEnumerationPattern);
});

test("daily note import modal submits through a native form", () => {
	const source = readFileSync("src/views/daily-note-import-modal.ts", "utf8");
	assert.match(source, /createEl\("form"\)/);
	assert.match(source, /addEventListener\("submit"/);
	assert.match(source, /event\.preventDefault\(\)/);
	assert.match(source, /type: "submit"/);
	assert.doesNotMatch(source, /setButtonText\("Import"\)/);
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
