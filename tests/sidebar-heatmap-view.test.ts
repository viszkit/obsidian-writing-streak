import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("sidebar routine refresh updates cached DOM instead of rebuilding content", () => {
	const source = readFileSync("src/views/sidebar-heatmap-view.ts", "utf8");
	const refreshBody = source.match(/\n\trefresh\(\) \{(?<body>[\s\S]*?)\n\t\}/)?.groups?.body ?? "";

	assert.match(refreshBody, /needsStructuralRender/);
	assert.match(refreshBody, /updateTodaySummary/);
	assert.match(refreshBody, /updateHeatmapCells/);
	assert.match(refreshBody, /updateStreakCards/);
	assert.doesNotMatch(refreshBody, /\.empty\(\)/);
	assert.doesNotMatch(refreshBody, /scrollIntoView/);
	assert.doesNotMatch(refreshBody, /scrollTop/);
	assert.match(source, /private renderStructure/);
	assert.match(source, /private heatmapCells = new Map<string, HTMLElement>/);
});

test("sidebar marks the active daily note cell without coupling it to today", () => {
	const source = readFileSync("src/views/sidebar-heatmap-view.ts", "utf8");

	assert.match(source, /getActiveDailyNoteDateKey\(\) === dateKey/);
	assert.match(source, /toggleClass\("wg-day-active-note", activeDailyNote\)/);
	assert.match(source, /toggleClass\("wg-day-today", today\)/);
	assert.match(source, /--wg-active-note-accent/);
});
