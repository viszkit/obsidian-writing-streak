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

test("sidebar heatmap stays responsive while capping and centering wide grids", () => {
	const styles = readFileSync("styles.css", "utf8");
	const gridRule = styles.match(/\.wg-sb-grid\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

	assert.match(gridRule, /width:\s*min\(100%,\s*300px\)/);
	assert.match(gridRule, /margin-inline:\s*auto/);
});

test("heatmap tooltip label does not conflict with the overachiever glow pseudo-element", () => {
	const sidebarSource = readFileSync("src/views/sidebar-heatmap-view.ts", "utf8");
	const detailSource = readFileSync("src/views/detail-modal.ts", "utf8");
	const styles = readFileSync("styles.css", "utf8");

	assert.match(sidebarSource, /createSpan\(\{ cls: "wg-tooltip-label" \}\)/);
	assert.match(sidebarSource, /tooltipLabel\.textContent = tooltip/);
	assert.match(detailSource, /createSpan\(\{ cls: "wg-tooltip-label", text: tooltip \}\)/);
	assert.match(styles, /\.wg-tooltip-label\s*\{/);
	assert.match(styles, /\.wg-tooltip:hover > \.wg-tooltip-label/);
	assert.match(styles, /\.wg-tooltip:focus-visible > \.wg-tooltip-label/);
	assert.doesNotMatch(styles, /\.wg-tooltip:hover::after/);
	assert.match(styles, /\.wg-cell-overachiever::after/);
});

test("detail heatmap scroll area reserves vertical room for daily tooltips", () => {
	const styles = readFileSync("styles.css", "utf8");
	const scrollWrapRule = styles.match(/\.wg-dt-scroll-wrap\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

	assert.match(scrollWrapRule, /overflow-x:\s*auto/);
	assert.match(scrollWrapRule, /margin-top:\s*-30px/);
	assert.match(scrollWrapRule, /padding-top:\s*30px/);
});

test("sidebar interaction states stack above overachiever cells", () => {
	const styles = readFileSync("styles.css", "utf8");
	const tooltipStackRule = styles.match(
		/\.wg-tooltip:hover,\s*\.wg-tooltip:focus-visible\s*\{(?<body>[^}]*)\}/,
	)?.groups?.body ?? "";
	const hoverRule = styles.match(/\.wg-sb-cell-clickable:hover\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
	const focusRule = styles.match(/\.wg-sb-cell-clickable:focus\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
	const focusVisibleRule = styles.match(
		/\.wg-sb-cell-clickable:focus-visible\s*\{(?<body>[^}]*)\}/,
	)?.groups?.body ?? "";

	assert.match(tooltipStackRule, /z-index:\s*4/);
	assert.match(hoverRule, /z-index:\s*4/);
	assert.match(focusRule, /z-index:\s*4/);
	assert.match(focusVisibleRule, /z-index:\s*4/);
});

test("light-theme sidebar uses a subtle scoped overachiever glow", () => {
	const styles = readFileSync("styles.css", "utf8");
	const lightSidebarGlowRule = styles.match(
		/\.theme-light \.wg-sb-cell\.wg-cell-overachiever::after\s*\{(?<body>[^}]*)\}/,
	)?.groups?.body ?? "";
	const darkSidebarGlowRule = styles.match(
		/\.wg-sb-cell\.wg-cell-overachiever::after\s*\{(?<body>[^}]*)\}/,
	)?.groups?.body ?? "";
	const detailGlowRule = styles.match(
		/\.wg-dt-cell\.wg-cell-overachiever::after\s*\{(?<body>[^}]*)\}/,
	)?.groups?.body ?? "";

	assert.match(lightSidebarGlowRule, /opacity:\s*0\.85/);
	assert.match(lightSidebarGlowRule, /0 0 0 1px var\(--wg-overachiever-border-strong\)/);
	assert.match(lightSidebarGlowRule, /0 0 8px var\(--wg-overachiever-glow\)/);
	assert.match(lightSidebarGlowRule, /0 0 14px var\(--wg-overachiever-glow-soft\)/);
	assert.match(darkSidebarGlowRule, /0 0 14px var\(--wg-overachiever-glow\)/);
	assert.match(darkSidebarGlowRule, /0 0 28px var\(--wg-overachiever-glow-soft\)/);
	assert.match(detailGlowRule, /0 0 4px var\(--wg-overachiever-glow\)/);
	assert.match(detailGlowRule, /0 0 8px var\(--wg-overachiever-glow-soft\)/);
});
