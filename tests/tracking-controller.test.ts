import test from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import type { ActiveDayData } from "../src/daily-progress";
import { shouldCountPath, type FolderFilterMode } from "../src/settings";
import { TrackingController } from "../src/tracking-controller";

function createController() {
	let activeDay: ActiveDayData = {
		date: "2026-04-15",
		files: {
			"Drafts/note.md": {
				baselineWords: 100,
				latestWords: 180,
				latestObservedAt: 2,
			},
		},
	};
	let today = "2026-04-15";
	let mode: FolderFilterMode = "exclude";
	let folders: string[] = [];
	const app = {
		workspace: {
			getLeavesOfType: () => [],
		},
	} as unknown as App;
	const controller = new TrackingController({
		app,
		getActiveDay: () => activeDay,
		setActiveDay: (nextActiveDay) => {
			activeDay = nextActiveDay;
		},
		todayKey: () => today,
		reloadSyncedData: async () => {},
		onProgressChanged: () => {},
		onPreviousDayFinalized: () => {},
		isFileExcluded: (path) => !shouldCountPath(path, folders, mode),
	});

	return {
		controller,
		setToday: (value: string) => {
			today = value;
		},
		setFilter: (nextMode: FolderFilterMode, nextFolders: string[]) => {
			mode = nextMode;
			folders = nextFolders;
		},
	};
}

test("controller restores progress after exclusion-list and include-mode changes", () => {
	const fixture = createController();
	assert.equal(fixture.controller.total(), 80);

	fixture.setFilter("exclude", ["Drafts/"]);
	assert.equal(fixture.controller.reconcileFileFilter(), true);
	assert.equal(fixture.controller.total(), 0);

	fixture.setFilter("exclude", []);
	assert.equal(fixture.controller.reconcileFileFilter(), true);
	assert.equal(fixture.controller.total(), 80);

	fixture.setFilter("include", ["Published/"]);
	assert.equal(fixture.controller.reconcileFileFilter(), true);
	assert.equal(fixture.controller.total(), 0);

	fixture.setFilter("include", ["Drafts/"]);
	assert.equal(fixture.controller.reconcileFileFilter(), true);
	assert.equal(fixture.controller.total(), 80);
});

test("controller does not restore suspended progress after day rollover", () => {
	const fixture = createController();
	fixture.setFilter("exclude", ["Drafts/"]);
	fixture.controller.reconcileFileFilter();
	assert.equal(fixture.controller.total(), 0);

	fixture.setToday("2026-04-16");
	assert.equal(fixture.controller.total(), 0);

	fixture.setFilter("exclude", []);
	assert.equal(fixture.controller.reconcileFileFilter(), false);
	assert.equal(fixture.controller.total(), 0);
});
