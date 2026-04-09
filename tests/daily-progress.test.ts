import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyActiveDay, getTodayTotal, mergeActiveDay, normalizeActiveDay, renameFileProgress, updateFileProgress } from "../src/daily-progress";

test("normalizeActiveDay falls back missing baseline to latest words", () => {
	const normalized = normalizeActiveDay("2026-04-04", {
		date: "2026-04-04",
		files: {
			"note.md": {
				latestWords: 2000,
				latestObservedAt: 1,
			} as never,
		},
	});
	assert.equal(normalized.files["note.md"].baselineWords, 2000);
	assert.equal(normalized.files["note.md"].latestWords, 2000);
});

test("normalizeActiveDay repairs invalid baseline using latest words", () => {
	const normalized = normalizeActiveDay("2026-04-04", {
		date: "2026-04-04",
		files: {
			"note.md": {
				baselineWords: Number.NaN,
				latestWords: 2000,
				latestObservedAt: 1,
			},
		},
	});
	assert.equal(normalized.files["note.md"].baselineWords, 2000);
	assert.equal(normalized.files["note.md"].latestWords, 2000);
});

test("net change is floored at zero", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "note.md", 100, 1);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "note.md", 80, 2);
	assert.equal(getTodayTotal(activeDay), 0);
});

test("per-file totals are aggregated", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "a.md", 10, 1);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "a.md", 25, 2);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "b.md", 5, 3);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "b.md", 9, 4);
	assert.equal(getTodayTotal(activeDay), 19);
});

test("rename keeps progress without duplication", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 20, 1);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 30, 2);
	activeDay = renameFileProgress(activeDay, "old.md", "new.md");
	assert.equal(getTodayTotal(activeDay), 10);
	assert.equal(activeDay.files["old.md"], undefined);
});

test("rename moves progress and a recreated old path starts fresh", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 20, 1);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 30, 2);
	activeDay = renameFileProgress(activeDay, "old.md", "new.md");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 50, 3);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "old.md", 70, 4);

	assert.equal(activeDay.files["new.md"].baselineWords, 20);
	assert.equal(activeDay.files["new.md"].latestWords, 30);
	assert.equal(activeDay.files["old.md"].baselineWords, 50);
	assert.equal(activeDay.files["old.md"].latestWords, 70);
	assert.equal(getTodayTotal(activeDay), 30);
});

test("active-day merge keeps earliest baseline and newest latest count", () => {
	let local = createEmptyActiveDay("2026-04-04");
	local = updateFileProgress(local, "2026-04-04", "note.md", 100, 10);
	local = updateFileProgress(local, "2026-04-04", "note.md", 120, 20);
	let incoming = createEmptyActiveDay("2026-04-04");
	incoming = updateFileProgress(incoming, "2026-04-04", "note.md", 90, 5);
	incoming = updateFileProgress(incoming, "2026-04-04", "note.md", 140, 30);
	const merged = mergeActiveDay(local, incoming, "2026-04-04");
	assert.equal(merged.files["note.md"].baselineWords, 90);
	assert.equal(merged.files["note.md"].latestWords, 140);
	assert.equal(getTodayTotal(merged), 50);
});

test("merge ignores partial zero baseline when latest matches a valid baseline snapshot", () => {
	const merged = mergeActiveDay({
		date: "2026-04-04",
		files: {
			"note.md": { baselineWords: 2000, latestWords: 2000, latestObservedAt: 10 },
		},
	}, {
		date: "2026-04-04",
		files: {
			"note.md": { baselineWords: 0, latestWords: 2000, latestObservedAt: 20 },
		},
	}, "2026-04-04");
	assert.equal(merged.files["note.md"].baselineWords, 2000);
	assert.equal(merged.files["note.md"].latestWords, 2000);
});

test("merge ignores stale empty snapshot when a valid baseline exists", () => {
	const merged = mergeActiveDay({
		date: "2026-04-04",
		files: {
			"note.md": { baselineWords: 0, latestWords: 0, latestObservedAt: 10 },
		},
	}, {
		date: "2026-04-04",
		files: {
			"note.md": { baselineWords: 2000, latestWords: 2200, latestObservedAt: 20 },
		},
	}, "2026-04-04");
	assert.equal(merged.files["note.md"].baselineWords, 2000);
	assert.equal(merged.files["note.md"].latestWords, 2200);
	assert.equal(getTodayTotal(merged), 200);
});

test("first observation of a pre-filled file starts with zero net new words", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "prefilled.md", 2000, 1);
	assert.equal(activeDay.files["prefilled.md"].baselineWords, 2000);
	assert.equal(activeDay.files["prefilled.md"].latestWords, 2000);
	assert.equal(getTodayTotal(activeDay), 0);
});

test("empty file can still grow from zero to counted words", () => {
	let activeDay = createEmptyActiveDay("2026-04-04");
	activeDay = updateFileProgress(activeDay, "2026-04-04", "draft.md", 0, 1);
	activeDay = updateFileProgress(activeDay, "2026-04-04", "draft.md", 2000, 2);
	assert.equal(activeDay.files["draft.md"].baselineWords, 0);
	assert.equal(activeDay.files["draft.md"].latestWords, 2000);
	assert.equal(getTodayTotal(activeDay), 2000);
});
