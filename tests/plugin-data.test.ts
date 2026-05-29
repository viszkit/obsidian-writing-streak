import test from "node:test";
import assert from "node:assert/strict";
import { PluginDataStore, normalizePluginData } from "../src/plugin-data";

const defaultSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
	excludedFolders: [],
};

function createStore(files: Record<string, string> = {}) {
	const writes: Array<{ path: string; contents: string }> = [];
	const store = new PluginDataStore(
		{
			exists: async (path) => Object.prototype.hasOwnProperty.call(files, path),
			read: async (path) => files[path],
			write: async (path, contents) => {
				writes.push({ path, contents });
				files[path] = contents;
			},
			stat: async () => null,
		},
		"data.json",
		defaultSettings,
		2,
		() => "2026-04-04"
	);
	return { store, writes, files };
}

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
	const { store } = createStore();
	const merged = store.merge(local, incoming);
	assert.equal(merged.history["2026-04-03"].totalWords, 110);
});

test("history goalMet defaults from goal threshold", () => {
	const data = normalizePluginData({
		history: { "2026-04-03": { totalWords: 600 } },
	}, defaultSettings, "2026-04-04", 2);
	assert.equal(data.history["2026-04-03"].goalMet, true);
});

test("valid primary data loads from data.json", async () => {
	const { store } = createStore({
		"data.json": JSON.stringify({
			settings: { dailyGoal: 750 },
			history: { "2026-04-03": { totalWords: 800, updatedAt: 25 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "2026-04-03",
		}),
	});
	const { data, sourcePath } = await store.loadBestAvailable();
	assert.equal(sourcePath, "data.json");
	assert.equal(data.settings.dailyGoal, 750);
	assert.equal(data.history["2026-04-03"].goalMet, true);
	assert.equal(data.lastWebhookSentDate, "2026-04-03");
});

test("missing primary data returns defaults", async () => {
	const { store } = createStore();
	const { data, sourcePath } = await store.loadBestAvailable();
	assert.equal(sourcePath, null);
	assert.deepEqual(data.settings, defaultSettings);
	assert.deepEqual(data.history, {});
	assert.equal(data.activeDay.date, "2026-04-04");
});

test("missing excluded folders setting defaults to an empty list", () => {
	const data = normalizePluginData({
		settings: { dailyGoal: 750 },
	}, defaultSettings, "2026-04-04", 2);

	assert.deepEqual(data.settings.excludedFolders, []);
});

test("excluded folders setting is normalized", () => {
	const data = normalizePluginData({
		settings: { excludedFolders: [" /Zettelkasten/Notes ", "Zettelkasten/Notes/", "", "Refs"] },
	}, defaultSettings, "2026-04-04", 2);

	assert.deepEqual(data.settings.excludedFolders, ["Zettelkasten/Notes/", "Refs/"]);
});

test("invalid primary data returns defaults and ignores backup data", async () => {
	const { store, writes } = createStore({
		"data.json": "{",
		"data.backup-1.json": JSON.stringify({
			settings: { dailyGoal: 999 },
			history: { "2026-04-03": { totalWords: 999, updatedAt: 25 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "2026-04-03",
		}),
	});
	const { data, sourcePath } = await store.loadBestAvailable();
	assert.equal(sourcePath, null);
	assert.equal(data.settings.dailyGoal, defaultSettings.dailyGoal);
	assert.deepEqual(data.history, {});
	assert.deepEqual(writes, []);
});

test("saveSafely writes only the primary data path", async () => {
	const { store, writes } = createStore({
		"data.json": JSON.stringify({ settings: defaultSettings }),
		"data.backup-1.json": JSON.stringify({ settings: { dailyGoal: 999 } }),
	});
	const data = normalizePluginData({
		settings: { dailyGoal: 650 },
		activeDay: { date: "2026-04-04", files: {} },
	}, defaultSettings, "2026-04-04", 2);
	await store.saveSafely(data);
	assert.deepEqual(writes.map((write) => write.path), ["data.json"]);
	assert.equal(JSON.parse(writes[0].contents).settings.dailyGoal, 650);
});
