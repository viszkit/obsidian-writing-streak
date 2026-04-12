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

test("loaded editor content wins over stored words", () => {
	assert.equal(resolveInitialSnapshotWords(1500, 2000), 1500);
});

test("fresh day keeps zero baseline after open before later writing", () => {
	let activeDay = createEmptyActiveDay("2026-04-12");
	activeDay = updateFileProgress(activeDay, "2026-04-12", "today.md", resolveInitialSnapshotWords(0, 0), 1);
	activeDay = updateFileProgress(activeDay, "2026-04-12", "today.md", 481, 2);

	assert.equal(activeDay.files["today.md"].baselineWords, 0);
	assert.equal(activeDay.files["today.md"].latestWords, 481);
	assert.equal(getTodayTotal(activeDay), 481);
});
