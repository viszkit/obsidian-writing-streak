import type { App } from "obsidian";
import type { OpenDailyNoteResult } from "./daily-notes";
import type { PluginDataShape } from "./plugin-data";
import type { WordGoalSettings } from "./settings";

export interface WordGoalPluginApi {
	app: App;
	data: PluginDataShape<WordGoalSettings>;
	settings: WordGoalSettings;
	todaysTotal(): number;
	isGoalCelebrating(): boolean;
	getActiveDailyNoteDateKey(): string | null;
	openDailyNoteForDate(date: Date): Promise<OpenDailyNoteResult>;
	sendTestWebhook(): Promise<void>;
	syncTodayHistory(): void;
	markDirty(options?: { refreshSidebar?: boolean }): void;
	flushSave(): Promise<void>;
	refreshUi(): void;
	pruneExcludedTrackedFiles(): boolean;
}
