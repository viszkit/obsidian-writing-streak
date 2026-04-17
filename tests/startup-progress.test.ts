import test from "node:test";
import assert from "node:assert/strict";
import { getTodayTotal } from "../src/daily-progress";
import { applyStoredBaselineSnapshot } from "../src/startup-progress";

test("fresh daily note keeps stored zero baseline when first live observation is stale and non-zero", () => {
	const result = applyStoredBaselineSnapshot(
		{ date: "2026-04-15", files: {} },
		"2026-04-15",
		"Journal/2026-04-15.md",
		0,
		10,
		599
	);

	assert.equal(result.initialized, true);
	assert.equal(result.repaired, false);
	assert.equal(result.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
	assert.equal(result.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.activeDay), 0);
});

test("prefilled daily note keeps stored template words as the baseline", () => {
	const result = applyStoredBaselineSnapshot(
		{ date: "2026-04-15", files: {} },
		"2026-04-15",
		"Journal/template.md",
		120,
		10,
		599
	);

	assert.equal(result.activeDay.files["Journal/template.md"].baselineWords, 120);
	assert.equal(result.activeDay.files["Journal/template.md"].latestWords, 120);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.activeDay), 0);
});

test("startup snapshot auto-repairs a stale baseline already written for today", () => {
	const result = applyStoredBaselineSnapshot(
		{
			date: "2026-04-15",
			files: {
				"Journal/2026-04-15.md": {
					baselineWords: 599,
					latestWords: 599,
					latestObservedAt: 5,
				},
			},
		},
		"2026-04-15",
		"Journal/2026-04-15.md",
		0,
		10
	);

	assert.equal(result.initialized, false);
	assert.equal(result.repaired, true);
	assert.equal(result.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
	assert.equal(result.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
	assert.equal(result.nextLastObservedWords, 599);
	assert.equal(getTodayTotal(result.activeDay), 0);
});
