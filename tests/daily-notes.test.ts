import test from "node:test";
import assert from "node:assert/strict";
import { TFile } from "obsidian";
import { openDailyNoteForDate } from "../src/daily-notes";

const DATE = new Date(2026, 4, 18);
const PATH = "Journal/2026-05-18.md";

function createApp(file: TFile | null, format = "YYYY-MM-DD") {
	const normalLeaf = {
		openFileCalls: [] as Array<{ file: TFile; state: unknown }>,
		async openFile(openedFile: TFile, state?: unknown) {
			this.openFileCalls.push({ file: openedFile, state });
		},
	};
	const tabLeaf = {
		openFileCalls: [] as Array<{ file: TFile; state: unknown }>,
		async openFile(openedFile: TFile, state?: unknown) {
			this.openFileCalls.push({ file: openedFile, state });
		},
	};
	const getLeafCalls: unknown[] = [];
	const setActiveLeafCalls: Array<{ leaf: unknown; state: unknown }> = [];
	const app = {
		plugins: { plugins: {} },
		internalPlugins: {
			getPluginById: () => ({
				instance: { options: { folder: "Journal", format } },
			}),
		},
		vault: {
			configDir: ".obsidian",
			adapter: {
				exists: async () => false,
				read: async () => "",
			},
			getAbstractFileByPath: (path: string) => path === PATH ? file : null,
		},
		workspace: {
			rootSplit: {},
			getMostRecentLeaf: () => normalLeaf,
			getLeaf: (newLeaf: unknown) => {
				getLeafCalls.push(newLeaf);
				return tabLeaf;
			},
			setActiveLeaf: (leaf: unknown, state: unknown) => {
				setActiveLeafCalls.push({ leaf, state });
			},
		},
	};

	return { app, normalLeaf, tabLeaf, getLeafCalls, setActiveLeafCalls };
}

test("daily-note opener keeps normal opens focused in the recent leaf", async () => {
	const file = Object.create(TFile.prototype) as TFile;
	const { app, normalLeaf, getLeafCalls, setActiveLeafCalls } = createApp(file);

	assert.deepEqual(await openDailyNoteForDate(app as never, DATE), { opened: true, path: PATH });
	assert.deepEqual(normalLeaf.openFileCalls, [{ file, state: undefined }]);
	assert.deepEqual(getLeafCalls, []);
	assert.deepEqual(setActiveLeafCalls, [{ leaf: normalLeaf, state: { focus: true } }]);
});

test("daily-note opener creates an unfocused tab for background opens", async () => {
	const file = Object.create(TFile.prototype) as TFile;
	const { app, normalLeaf, tabLeaf, getLeafCalls, setActiveLeafCalls } = createApp(file);

	assert.deepEqual(await openDailyNoteForDate(app as never, DATE, { newTab: true }), { opened: true, path: PATH });
	assert.deepEqual(getLeafCalls, ["tab"]);
	assert.deepEqual(tabLeaf.openFileCalls, [{ file, state: { active: false } }]);
	assert.deepEqual(normalLeaf.openFileCalls, []);
	assert.deepEqual(setActiveLeafCalls, []);
});

test("daily-note opener preserves resolution failures for background opens", async () => {
	const missingConfig = createApp(null);
	missingConfig.app.internalPlugins.getPluginById = () => undefined as never;
	assert.deepEqual(await openDailyNoteForDate(missingConfig.app as never, DATE, { newTab: true }), {
		opened: false,
		reason: "missing-config",
	});

	const invalidPath = createApp(null, "[]");
	assert.deepEqual(await openDailyNoteForDate(invalidPath.app as never, DATE, { newTab: true }), {
		opened: false,
		reason: "invalid-path",
	});

	const missingFile = createApp(null);
	assert.deepEqual(await openDailyNoteForDate(missingFile.app as never, DATE, { newTab: true }), {
		opened: false,
		reason: "missing-file",
		path: PATH,
	});
});
