import test from "node:test";
import assert from "node:assert/strict";
import { PluginDataStore, normalizePluginData } from "../src/plugin-data";

const defaultSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
};

test("legacy todaysWordCount migrates into activeDay", () => {
	const data = normalizePluginData({
		history: { "2026-04-03": { totalWords: 123 } },
		todaysDate: "2026-04-04",
		todaysWordCount: {
			"note.md": { initial: 100, peak: 145, current: 130 },
		},
	}, defaultSettings, "2026-04-04", 2);
	assert.equal(data.activeDay.files["note.md"].baselineWords, 100);
	assert.equal(data.activeDay.files["note.md"].latestWords, 130);
	assert.equal(data.history["2026-04-03"].goalMet, false);
});

test("legacy migration uses current words as baseline when initial is missing", () => {
	const data = normalizePluginData({
		todaysDate: "2026-04-04",
		todaysWordCount: {
			"note.md": { current: 2000 },
		},
	}, defaultSettings, "2026-04-04", 2);
	assert.equal(data.activeDay.files["note.md"].baselineWords, 2000);
	assert.equal(data.activeDay.files["note.md"].latestWords, 2000);
});

test("legacy migration uses peak words as baseline when initial and current are missing", () => {
	const data = normalizePluginData({
		todaysDate: "2026-04-04",
		todaysWordCount: {
			"note.md": { peak: 2000 },
		},
	}, defaultSettings, "2026-04-04", 2);
	assert.equal(data.activeDay.files["note.md"].baselineWords, 2000);
	assert.equal(data.activeDay.files["note.md"].latestWords, 2000);
});

test("history merge prefers newer updated records", () => {
	const local = normalizePluginData({
		history: { "2026-04-03": { totalWords: 100, goalMet: false, updatedAt: 10 } },
	}, defaultSettings, "2026-04-04", 2);
	const incoming = normalizePluginData({
		history: { "2026-04-03": { totalWords: 110, goalMet: false, updatedAt: 20 } },
	}, defaultSettings, "2026-04-04", 2);
	const store = new PluginDataStore(
		{
			exists: async () => false,
			read: async () => "",
			write: async () => {},
			copy: async () => {},
			rename: async () => {},
			remove: async () => {},
			stat: async () => null,
		},
		"data.json",
		["backup.json"],
		defaultSettings,
		2,
		() => "2026-04-04"
	);
	const merged = store.merge(local, incoming);
	assert.equal(merged.history["2026-04-03"].totalWords, 110);
});

test("history goalMet defaults from goal threshold", () => {
	const data = normalizePluginData({
		history: { "2026-04-03": { totalWords: 600 } },
	}, defaultSettings, "2026-04-04", 2);
	assert.equal(data.history["2026-04-03"].goalMet, true);
});
