import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyActiveDay, getTodayTotal, mergeActiveDay, renameFileProgress, updateFileProgress } from "../src/daily-progress";

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
