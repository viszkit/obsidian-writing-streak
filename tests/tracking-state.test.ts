import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyActiveDay, getTodayTotal } from "../src/daily-progress";
import {
	createTrackingState,
	hasDuplicateObservation,
	initializeFileBaselineFromStoredSnapshot,
	recordObservedFileWords,
	renameTrackedFile,
	rollTrackingStateToDate,
} from "../src/tracking-state";

test("fresh daily note keeps stored zero baseline when first live observation is stale and non-zero", () => {
	const result = initializeFileBaselineFromStoredSnapshot(
		createTrackingState({ date: "2026-04-15", files: {} }),
		"2026-04-15",
		"Journal/2026-04-15.md",
		0,
		10,
		599
	);

	assert.equal(result.initialized, true);
	assert.equal(result.repaired, false);
	assert.equal(result.state.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
	assert.equal(result.state.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.state.activeDay), 0);
});

test("prefilled daily note keeps stored template words as the baseline", () => {
	const result = initializeFileBaselineFromStoredSnapshot(
		createTrackingState({ date: "2026-04-15", files: {} }),
		"2026-04-15",
		"Journal/template.md",
		120,
		10,
		599
	);

	assert.equal(result.state.activeDay.files["Journal/template.md"].baselineWords, 120);
	assert.equal(result.state.activeDay.files["Journal/template.md"].latestWords, 120);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.state.activeDay), 0);
});

test("startup snapshot auto-repairs a stale baseline already written for today", () => {
	const result = initializeFileBaselineFromStoredSnapshot(
		createTrackingState({
			date: "2026-04-15",
			files: {
				"Journal/2026-04-15.md": {
					baselineWords: 599,
					latestWords: 599,
					latestObservedAt: 5,
				},
			},
		}),
		"2026-04-15",
		"Journal/2026-04-15.md",
		0,
		10
	);

	assert.equal(result.initialized, false);
	assert.equal(result.repaired, true);
	assert.equal(result.state.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
	assert.equal(result.state.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.state.activeDay), 0);
});

test("first live editor change counts immediately after stored baseline initialization", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = initializeFileBaselineFromStoredSnapshot(
		state,
		"2026-04-15",
		"Journal/2026-04-15.md",
		0,
		10,
		599
	).state;

	const observed = recordObservedFileWords(
		state,
		"2026-04-15",
		"Journal/2026-04-15.md",
		599,
		11
	);

	assert.equal(observed.changed, true);
	assert.equal(observed.duplicate, false);
	assert.equal(getTodayTotal(observed.state.activeDay), 599);
});

test("duplicate observations are suppressed", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 10, 1).state;
	const duplicate = recordObservedFileWords(state, "2026-04-15", "note.md", 10, 2);

	assert.equal(hasDuplicateObservation(state, "note.md", 10), true);
	assert.equal(duplicate.changed, false);
	assert.equal(duplicate.duplicate, true);
});

test("rename moves active progress and last observed words", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "old.md", 20, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "old.md", 30, 2).state;

	const renamed = renameTrackedFile(state, "old.md", "new.md");

	assert.equal(renamed.changed, true);
	assert.equal(renamed.state.activeDay.files["old.md"], undefined);
	assert.equal(renamed.state.activeDay.files["new.md"].baselineWords, 20);
	assert.equal(hasDuplicateObservation(renamed.state, "new.md", 30), true);
	assert.equal(getTodayTotal(renamed.state.activeDay), 10);
});

test("day rollover reports the previous total and resets active tracking", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 100, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 125, 2).state;

	const rollover = rollTrackingStateToDate(state, "2026-04-16");

	assert.equal(rollover.changed, true);
	assert.equal(rollover.previousDate, "2026-04-15");
	assert.equal(rollover.previousTotal, 25);
	assert.equal(rollover.state.activeDay.date, "2026-04-16");
	assert.equal(getTodayTotal(rollover.state.activeDay), 0);
});
