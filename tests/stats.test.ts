import test from "node:test";
import assert from "node:assert/strict";
import type { DailyRecord } from "../src/daily-progress";
import { getHeatmapCellState } from "../src/stats";

const DATE = new Date(2026, 0, 15);
const DATE_KEY = "2026-01-15";
const DAILY_GOAL = 600;

function cellState(totalWords: number, goalMet = false) {
	const history: Record<string, DailyRecord> = {
		[DATE_KEY]: { totalWords, goalMet },
	};
	return getHeatmapCellState(history, DATE, DAILY_GOAL);
}

test("heatmap uses goal-anchored intensity boundaries", () => {
	assert.equal(cellState(0).level, 0);
	assert.equal(cellState(200).level, 1);
	assert.equal(cellState(201).level, 2);
	assert.equal(cellState(400).level, 2);
	assert.equal(cellState(401).level, 3);
	assert.equal(cellState(599).level, 3);
	assert.equal(cellState(600).level, 4);
	assert.equal(cellState(899).level, 4);
	assert.equal(cellState(900).level, 5);
});

test("historical goal achievement keeps the strongest shade", () => {
	const state = cellState(300, true);

	assert.equal(state.level, 4);
	assert.equal(state.goalMet, true);
});

test("an extreme outlier does not affect another day's intensity", () => {
	const history: Record<string, DailyRecord> = {
		[DATE_KEY]: { totalWords: 400, goalMet: false },
		"2026-01-16": { totalWords: 10000, goalMet: true },
	};

	assert.equal(getHeatmapCellState(history, DATE, DAILY_GOAL).level, 2);
});

test("overachiever level is based on the current goal even when goalMet is stored", () => {
	assert.equal(cellState(899, true).level, 4);
	assert.equal(cellState(900, true).level, 5);
});
