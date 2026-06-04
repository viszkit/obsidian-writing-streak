import test from "node:test";
import assert from "node:assert/strict";
import { PluginDataCoordinator } from "../src/data-sync";
import { normalizePluginData, type PluginDataShape } from "../src/plugin-data";

const defaultSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
	folderFilterMode: "exclude",
};

type TestSettings = typeof defaultSettings;

function makeData(input: unknown): PluginDataShape<TestSettings> {
	return normalizePluginData(input, defaultSettings, "2026-04-04", 2);
}

function createAdapter(
	files: Record<string, string> = {},
	mtimes: Record<string, number> = {},
	onWrite?: () => void
) {
	const writes: Array<{ path: string; contents: string }> = [];
	return {
		writes,
		adapter: {
			exists: async (path: string) => Object.prototype.hasOwnProperty.call(files, path),
			read: async (path: string) => files[path],
			write: async (path: string, contents: string) => {
				writes.push({ path, contents });
				files[path] = contents;
				mtimes[path] = (mtimes[path] ?? 0) + 1;
				onWrite?.();
			},
			stat: async (path: string) => Object.prototype.hasOwnProperty.call(files, path)
				? { mtime: mtimes[path] ?? 0 }
				: null,
		},
	};
}

function createCoordinator(
	files: Record<string, string> = {},
	mtimes: Record<string, number> = {},
	onDataMerged?: (data: PluginDataShape<TestSettings>) => PluginDataShape<TestSettings>,
	getCurrentData?: () => PluginDataShape<TestSettings>
) {
	const { adapter, writes } = createAdapter(files, mtimes);
	const coordinator = new PluginDataCoordinator({
		adapter,
		primaryPath: "data.json",
		defaultSettings,
		version: 2,
		getTodayKey: () => "2026-04-04",
		getCurrentData,
		onDataMerged,
	});
	return { coordinator, writes };
}

test("PluginDataCoordinator load returns defaults when primary data is missing", async () => {
	const { coordinator } = createCoordinator();

	const result = await coordinator.load();

	assert.equal(result.shouldOpenHeatmapOnFirstInstall, true);
	assert.deepEqual(result.data.settings, defaultSettings);
	assert.deepEqual(result.data.history, {});
	assert.equal(result.data.activeDay.date, "2026-04-04");
});

test("PluginDataCoordinator flush merges incoming disk data before saving", async () => {
	const files = {
		"data.json": JSON.stringify({
			settings: defaultSettings,
			history: { "2026-04-03": { totalWords: 100, updatedAt: 20 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "",
		}),
	};
	const { coordinator, writes } = createCoordinator(files, { "data.json": 10 });
	const local = makeData({
		settings: defaultSettings,
		history: { "2026-04-02": { totalWords: 50, updatedAt: 10 } },
		activeDay: { date: "2026-04-04", files: {} },
	});

	coordinator.markDirty();
	const saved = await coordinator.flush(local);

	assert.equal(saved.history["2026-04-02"].totalWords, 50);
	assert.equal(saved.history["2026-04-03"].totalWords, 100);
	assert.equal(JSON.parse(writes[0].contents).history["2026-04-03"].totalWords, 100);
});

test("PluginDataCoordinator applies merge callback before saving merged data", async () => {
	const files = {
		"data.json": JSON.stringify({
			settings: defaultSettings,
			history: { "2026-04-03": { totalWords: 100, updatedAt: 20 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "",
		}),
	};
	let callbackCount = 0;
	const { coordinator, writes } = createCoordinator(files, { "data.json": 10 }, (data) => {
		callbackCount++;
		return {
			...data,
			history: {
				...data.history,
				"2026-04-04": { totalWords: 25, goalMet: false, updatedAt: 30 },
			},
		};
	});

	coordinator.markDirty();
	const saved = await coordinator.flush(makeData({ settings: defaultSettings }));

	assert.equal(callbackCount, 1);
	assert.equal(saved.history["2026-04-04"].totalWords, 25);
	assert.equal(JSON.parse(writes[0].contents).history["2026-04-04"].totalWords, 25);
});

test("PluginDataCoordinator save loop uses latest current data after in-flight mutations", async () => {
	const files = {
		"data.json": JSON.stringify({
			settings: defaultSettings,
			history: {},
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "",
		}),
	};
	let currentData = makeData({
		settings: defaultSettings,
		history: { "2026-04-02": { totalWords: 50, updatedAt: 10 } },
	});
	let coordinator: PluginDataCoordinator<TestSettings>;
	const { adapter, writes } = createAdapter(files, { "data.json": 10 }, () => {
		if (writes.length !== 1) return;
		currentData = makeData({
			settings: defaultSettings,
			history: { "2026-04-03": { totalWords: 75, updatedAt: 20 } },
		});
		coordinator.markDirty();
	});
	coordinator = new PluginDataCoordinator({
		adapter,
		primaryPath: "data.json",
		defaultSettings,
		version: 2,
		getTodayKey: () => "2026-04-04",
		getCurrentData: () => currentData,
	});

	coordinator.markDirty();
	const saved = await coordinator.flush(currentData);

	assert.equal(saved.history["2026-04-03"].totalWords, 75);
	assert.equal(JSON.parse(writes[writes.length - 1].contents).history["2026-04-03"].totalWords, 75);
});

test("PluginDataCoordinator reloadIfChanged skips unchanged mtimes", async () => {
	const files = {
		"data.json": JSON.stringify({
			settings: defaultSettings,
			history: { "2026-04-03": { totalWords: 100, updatedAt: 20 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "",
		}),
	};
	const { coordinator } = createCoordinator(files, { "data.json": 10 });
	const loaded = await coordinator.load();

	const result = await coordinator.reloadIfChanged(loaded.data);

	assert.equal(result.changed, false);
	assert.equal(result.data, loaded.data);
});

test("PluginDataCoordinator reloadIfChanged merges when mtime increases", async () => {
	const files = {
		"data.json": JSON.stringify({
			settings: defaultSettings,
			history: { "2026-04-03": { totalWords: 100, updatedAt: 20 } },
			activeDay: { date: "2026-04-04", files: {} },
			lastWebhookSentDate: "",
		}),
	};
	const mtimes = { "data.json": 10 };
	const { coordinator } = createCoordinator(files, mtimes);
	const loaded = await coordinator.load();
	files["data.json"] = JSON.stringify({
		settings: defaultSettings,
		history: { "2026-04-03": { totalWords: 250, updatedAt: 30 } },
		activeDay: { date: "2026-04-04", files: {} },
		lastWebhookSentDate: "",
	});
	mtimes["data.json"] = 11;

	const result = await coordinator.reloadIfChanged(loaded.data);

	assert.equal(result.changed, true);
	assert.equal(result.data.history["2026-04-03"].totalWords, 250);
});
