import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialSnapshotWords } from "../src/initial-snapshot";
import { createEmptyActiveDay, getTodayTotal, updateFileProgress } from "../src/daily-progress";

test("first open falls back to stored words when editor is still empty", () => {
	assert.equal(resolveInitialSnapshotWords(0, 2000), 2000);
});

test("empty files keep a zero baseline on first open", () => {
	assert.equal(resolveInitialSnapshotWords(0, 0), 0);
});

test("stale non-zero editor words do not override an empty stored file", () => {
	assert.equal(resolveInitialSnapshotWords(481, 0), 0);
});

test("stored file words win over stale editor words for existing notes", () => {
	assert.equal(resolveInitialSnapshotWords(481, 2000), 2000);
});

test("fresh day keeps zero baseline after open before later writing", () => {
	let activeDay = createEmptyActiveDay("2026-04-12");
	activeDay = updateFileProgress(activeDay, "2026-04-12", "today.md", resolveInitialSnapshotWords(481, 0), 1);
	activeDay = updateFileProgress(activeDay, "2026-04-12", "today.md", 481, 2);

	assert.equal(activeDay.files["today.md"].baselineWords, 0);
	assert.equal(activeDay.files["today.md"].latestWords, 481);
	assert.equal(getTodayTotal(activeDay), 481);
});

test("later editor-driven updates still grow from the stored baseline", () => {
	let activeDay = createEmptyActiveDay("2026-04-12");
	activeDay = updateFileProgress(activeDay, "2026-04-12", "existing.md", resolveInitialSnapshotWords(481, 2000), 1);
	activeDay = updateFileProgress(activeDay, "2026-04-12", "existing.md", 2125, 2);

	assert.equal(activeDay.files["existing.md"].baselineWords, 2000);
	assert.equal(activeDay.files["existing.md"].latestWords, 2125);
	assert.equal(getTodayTotal(activeDay), 125);
});
