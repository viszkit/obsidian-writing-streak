import type { App } from "obsidian";
import type { PluginDataShape } from "./plugin-data";
import type { WordGoalSettings } from "./settings";

export interface WordGoalPluginApi {
	app: App;
	data: PluginDataShape<WordGoalSettings>;
	settings: WordGoalSettings;
	todaysTotal(): number;
	isGoalCelebrating(): boolean;
	openDailyNoteForDate(date: Date): Promise<boolean>;
	sendTestWebhook(): Promise<void>;
	syncTodayHistory(): void;
	markDirty(options?: { refreshSidebar?: boolean }): void;
	flushSave(): Promise<void>;
	refreshUi(): void;
}
