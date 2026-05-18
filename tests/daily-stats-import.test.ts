import test from "node:test";
import assert from "node:assert/strict";
import {
	dailyStatsKeyToDateKey,
	importDailyStatsHistory,
	parseDailyStatsDayCounts,
} from "../src/imports/daily-stats-import";
import type { DailyRecord } from "../src/daily-progress";

test("parseDailyStatsDayCounts keeps finite numeric day counts", () => {
	const dayCounts = parseDailyStatsDayCounts(JSON.stringify({
		dayCounts: {
			"2026/0/4": 500,
			"2026/0/5": Number.NaN,
			"2026/0/6": "600",
		},
	}));

	assert.deepEqual(dayCounts, { "2026/0/4": 500 });
});

test("dailyStatsKeyToDateKey converts zero-based month keys to ISO dates", () => {
	assert.equal(dailyStatsKeyToDateKey("2026/0/4"), "2026-01-04");
	assert.equal(dailyStatsKeyToDateKey("2026/11/31"), "2026-12-31");
});

test("importDailyStatsHistory imports missing days and does not overwrite non-zero history", () => {
	const history: Record<string, DailyRecord> = {
		"2026-01-04": { totalWords: 900, goalMet: true, updatedAt: 12 },
		"2026-01-05": { totalWords: 0, goalMet: false, updatedAt: 0 },
	};

	const result = importDailyStatsHistory(history, {
		"2026/0/4": 500,
		"2026/0/5": 250,
		"2026/0/6": 600,
	}, 500);

	assert.equal(result.imported, 2);
	assert.equal(history["2026-01-04"].totalWords, 900);
	assert.deepEqual(history["2026-01-05"], { totalWords: 250, goalMet: false, updatedAt: 0 });
	assert.deepEqual(history["2026-01-06"], { totalWords: 600, goalMet: true, updatedAt: 0 });
});
