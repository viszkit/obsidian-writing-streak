import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyActiveDay, getTodayTotal } from "../src/daily-progress";
import {
	createTrackingState,
	hasDuplicateObservation,
	initializeFileBaselineFromStoredSnapshot,
	recordObservedFileWords,
	removeTrackedFile,
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

test("baseline lowers when a note is deleted below its starting point", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 1000, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 600, 2).state;

	assert.equal(state.activeDay.files["note.md"].baselineWords, 600);
	assert.equal(state.activeDay.files["note.md"].latestWords, 600);
	assert.equal(getTodayTotal(state.activeDay), 0);
});

test("growth after deletion counts from the lowered baseline", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 1000, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 600, 2).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 680, 3).state;

	assert.equal(state.activeDay.files["note.md"].baselineWords, 600);
	assert.equal(state.activeDay.files["note.md"].latestWords, 680);
	assert.equal(getTodayTotal(state.activeDay), 80);
});

test("removing a tracked file removes its active-day contribution", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 100, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 180, 2).state;

	const removed = removeTrackedFile(state, "note.md");

	assert.equal(removed.changed, true);
	assert.equal(removed.state.activeDay.files["note.md"], undefined);
	assert.equal(hasDuplicateObservation(removed.state, "note.md", 180), false);
	assert.equal(getTodayTotal(removed.state.activeDay), 0);
});

test("removed file starts fresh if it is observed again later", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 100, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 180, 2).state;
	state = removeTrackedFile(state, "note.md").state;
	state = recordObservedFileWords(state, "2026-04-15", "note.md", 300, 3).state;

	assert.equal(state.activeDay.files["note.md"].baselineWords, 300);
	assert.equal(state.activeDay.files["note.md"].latestWords, 300);
	assert.equal(getTodayTotal(state.activeDay), 0);
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

test("rename reconciles move race without duplicating the same latest words", () => {
	let state = createTrackingState(createEmptyActiveDay("2026-04-15"));
	state = recordObservedFileWords(state, "2026-04-15", "old.md", 0, 1).state;
	state = recordObservedFileWords(state, "2026-04-15", "old.md", 39, 2).state;
	state = recordObservedFileWords(state, "2026-04-15", "folder/new.md", 39, 3).state;

	const renamed = renameTrackedFile(state, "old.md", "folder/new.md");

	assert.equal(renamed.changed, true);
	assert.equal(renamed.state.activeDay.files["old.md"], undefined);
	assert.equal(renamed.state.activeDay.files["folder/new.md"].baselineWords, 0);
	assert.equal(renamed.state.activeDay.files["folder/new.md"].latestWords, 39);
	assert.equal(hasDuplicateObservation(renamed.state, "folder/new.md", 39), true);
	assert.equal(getTodayTotal(renamed.state.activeDay), 39);
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
