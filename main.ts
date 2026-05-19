import { Notice, Plugin, TFile } from "obsidian";
import { PluginDataCoordinator } from "./src/data-sync";
import { todayKey } from "./src/dates";
import { createEmptyActiveDay, getTodayTotal } from "./src/daily-progress";
import { openDailyNoteForDate as openDailyNote } from "./src/daily-notes";
import { importDailyNoteWordCounts as importDailyNoteWordCountsFromVault } from "./src/imports/daily-note-word-count-import";
import type { DailyNoteWordCountImportRange } from "./src/imports/daily-note-word-count-import";
import { importDailyStatsHistory, parseDailyStatsDayCounts } from "./src/imports/daily-stats-import";
import type { WordGoalPluginApi } from "./src/plugin-api";
import type { PluginDataShape } from "./src/plugin-data";
import { DEFAULT_SETTINGS, PLUGIN_DATA_VERSION, type WordGoalSettings } from "./src/settings";
import { WordGoalSettingTab } from "./src/settings-tab";
import { TrackingController } from "./src/tracking-controller";
import { renderStatusBar } from "./src/ui/status-bar";
import { sendWebhook, shouldMarkWebhookHandled } from "./src/webhook";
import { SidebarHeatmapView, VIEW_TYPE_HEATMAP } from "./src/views/sidebar-heatmap-view";
import { DetailModal } from "./src/views/detail-modal";
import { DailyNoteImportModal } from "./src/views/daily-note-import-modal";

export default class WordGoalWebhookPlugin extends Plugin implements WordGoalPluginApi {
	data: PluginDataShape<WordGoalSettings> = {
		version: PLUGIN_DATA_VERSION,
		settings: { ...DEFAULT_SETTINGS },
		history: {},
		activeDay: createEmptyActiveDay(todayKey()),
		lastWebhookSentDate: "",
	};
	private statusBarEl: HTMLElement | null = null;
	private visibilityHandler: () => void = () => {};
	private webhookSendInFlightDate: string | null = null;
	private dataCoordinator: PluginDataCoordinator<WordGoalSettings> | null = null;
	private trackingController: TrackingController | null = null;
	private celebrateGoalUntil = 0;
	private celebrateGoalTimer: number | null = null;
	private visibilityDocument: Document | null = null;
	private shouldOpenHeatmapOnFirstInstall = false;

	get settings(): WordGoalSettings { return this.data.settings; }

	private get tracker(): TrackingController {
		if (!this.trackingController) {
			throw new Error("Tracking controller is not initialized.");
		}
		return this.trackingController;
	}

	private createTrackingController(): TrackingController {
		return new TrackingController({
			app: this.app,
			getActiveDay: () => this.data.activeDay,
			setActiveDay: (activeDay) => {
				this.data.activeDay = activeDay;
			},
			todayKey: () => todayKey(),
			reloadSyncedData: () => this.reloadAndMergeSyncedPluginData(),
			onProgressChanged: () => this.finalizeProgressChange(),
			onPreviousDayFinalized: (dateKey, totalWords) => this.syncHistoryEntry(dateKey, totalWords),
		});
	}

	private createDataCoordinator(): PluginDataCoordinator<WordGoalSettings> {
		return new PluginDataCoordinator({
			adapter: this.app.vault.adapter,
			primaryPath: this.getPluginDataPath(),
			defaultSettings: DEFAULT_SETTINGS,
			version: PLUGIN_DATA_VERSION,
			getTodayKey: () => todayKey(),
			getCurrentData: () => this.data,
			onDataMerged: (data) => this.applyMergedData(data),
			onPendingSidebarRefresh: () => this.refreshSidebar(),
		});
	}

	private get dataSync(): PluginDataCoordinator<WordGoalSettings> {
		if (!this.dataCoordinator) {
			throw new Error("Plugin data coordinator is not initialized.");
		}
		return this.dataCoordinator;
	}

	onload() {
		void this.loadPlugin().catch((err) => console.error("Failed to load Word Goal plugin:", err));
	}

	private async loadPlugin() {
		this.dataCoordinator = this.createDataCoordinator();
		await this.loadPluginData();
		this.trackingController = this.createTrackingController();
		this.todaysTotal();
		this.syncTodayHistory();

		this.addSettingTab(new WordGoalSettingTab(this.app, this));
		this.registerView(VIEW_TYPE_HEATMAP, (leaf) => new SidebarHeatmapView(leaf, this));

		this.addCommand({
			id: "open-writing-heatmap",
			name: "Open writing heatmap",
			callback: () => {
				void this.activateSidebar().catch((err) => console.error("Failed to open writing heatmap:", err));
			},
		});
		this.addCommand({ id: "open-writing-stats", name: "Open writing stats", callback: () => new DetailModal(this.app, this).open() });
		this.addCommand({ id: "show-daily-word-count", name: "Show today's word count", callback: () => new Notice(`Today: ${this.todaysTotal()} / ${this.settings.dailyGoal} Words`) });
		this.addCommand({
			id: "import-daily-stats",
			name: "Import history from daily stats plugin",
			callback: () => {
				void this.importDailyStats().catch((err) => console.error("Failed to import Daily Stats history:", err));
			},
		});
		this.addCommand({
			id: "import-daily-note-word-counts",
			name: "Import word counts from daily notes",
			callback: () => {
				new DailyNoteImportModal(this.app, (range) => this.importDailyNoteWordCounts(range)).open();
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor) => {
				this.tracker.handleEditorChange(editor);
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.tracker.handleActiveLeafChange(leaf);
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!(file instanceof TFile)) return;
				this.tracker.handleFileOpen(file);
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				void this.tracker.handleVaultModify(file)
					.catch((err) => console.error("Failed to handle vault modify:", err));
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				this.tracker.handleFileRename(file, oldPath);
			})
		);

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("wg-statusbar");
		this.registerInterval(window.setInterval(() => this.updateStatusBar(), 1000));
		this.updateStatusBar();

		const visibilityDocument = activeDocument;
		this.visibilityDocument = visibilityDocument;
		this.visibilityHandler = () => {
			if (visibilityDocument.visibilityState === "hidden") {
				this.syncTodayHistory();
				this.markDirty({ refreshSidebar: true });
				void this.flushSave().catch((err) => console.error("Failed to flush plugin data on background:", err));
				return;
			}
			void this.reloadSyncedDataAndRefreshUi().catch((err) => console.error("Failed to reload synced plugin data:", err));
		};
		visibilityDocument.addEventListener("visibilitychange", this.visibilityHandler);

		this.app.workspace.onLayoutReady(() => {
			void this.handleLayoutReady().catch((err) => console.error("Failed during layout-ready initialization:", err));
		});
	}

	onunload() {
		this.visibilityDocument?.removeEventListener("visibilitychange", this.visibilityHandler);
		this.visibilityDocument = null;
		if (this.celebrateGoalTimer !== null) {
			window.clearTimeout(this.celebrateGoalTimer);
			this.celebrateGoalTimer = null;
		}
		this.dataCoordinator?.dispose();
		this.trackingController?.dispose();
		this.finalizeToday();
		this.markDirty({ refreshSidebar: false });
		void this.flushSave().catch((err) => console.error("Failed to flush plugin data on unload:", err));
	}

	todaysTotal(): number {
		return this.trackingController ? this.tracker.total() : getTodayTotal(this.data.activeDay);
	}

	syncTodayHistory() {
		this.syncHistoryEntry(todayKey(), this.todaysTotal());
	}

	private syncHistoryEntry(dateKey: string, totalWords: number) {
		const existing = this.data.history[dateKey];
		if (totalWords > 0) {
			this.data.history[dateKey] = {
				totalWords,
				goalMet: existing?.goalMet === true || totalWords >= this.settings.dailyGoal,
				updatedAt: Date.now(),
			};
			return;
		}
		if (existing?.totalWords && existing.totalWords > 0) return;
		delete this.data.history[dateKey];
	}

	private finalizeToday() {
		this.trackingController?.finalizeToday();
	}

	private finalizeProgressChange() {
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.refreshUi();
		this.maybeCelebrateGoal();
	}

	private async handleLayoutReady() {
		const initialized = await this.tracker.handleLayoutReady();
		if (!initialized) {
			this.syncTodayHistory();
			this.refreshUi();
		}
		if (this.shouldOpenHeatmapOnFirstInstall) {
			this.shouldOpenHeatmapOnFirstInstall = false;
			await this.activateSidebar();
			this.markDirty({ refreshSidebar: false });
			await this.flushSave();
		}
	}

	private maybeCelebrateGoal() {
		if (
			this.todaysTotal() >= this.settings.dailyGoal &&
			this.data.lastWebhookSentDate !== this.data.activeDay.date &&
			this.webhookSendInFlightDate !== this.data.activeDay.date
		) {
			this.webhookSendInFlightDate = this.data.activeDay.date;
			this.triggerGoalCelebration();
			new Notice(`🎉 You Hit ${this.settings.dailyGoal} Words Today!`);
			void this.fireWebhook().catch((err) => console.error("Failed to send goal webhook:", err));
		}
	}

	isGoalCelebrating(): boolean {
		return this.celebrateGoalUntil > Date.now();
	}

	private triggerGoalCelebration() {
		this.celebrateGoalUntil = Date.now() + 2200;
		if (this.celebrateGoalTimer !== null) {
			window.clearTimeout(this.celebrateGoalTimer);
		}
		this.refreshSidebar();
		this.celebrateGoalTimer = window.setTimeout(() => {
			this.celebrateGoalTimer = null;
			this.refreshSidebar();
		}, 2200);
	}

	refreshUi() {
		this.updateStatusBar();
		this.refreshSidebar();
	}

	private getPluginDataPath(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/data.json`;
	}

	private async reloadAndMergeSyncedPluginData() {
		try {
			const result = await this.dataSync.reloadIfChanged(this.data);
			if (!result.changed) return;
			this.applyMergedData(result.data);
		} catch (err) {
			console.error("Failed to reload synced plugin data:", err);
		}
	}

	private async reloadSyncedDataAndRefreshUi() {
		await this.reloadAndMergeSyncedPluginData();
		this.refreshUi();
	}

	markDirty(options?: { refreshSidebar?: boolean }) {
		this.dataSync.markDirty(options);
	}

	private scheduleSave() {
		this.dataSync.scheduleFlush(() => {
			void this.flushSave().catch((err) => console.error("Failed to flush scheduled plugin data save:", err));
		});
	}

	async flushSave() {
		this.data = await this.dataSync.flush(this.data);
	}

	private async importDailyStats() {
		try {
			const adapter = this.app.vault.adapter;
			const path = `${this.app.vault.configDir}/plugins/obsidian-daily-stats/data.json`;
			const exists = await adapter.exists(path);
			if (!exists) {
				new Notice("Daily stats plugin data.json not found.");
				return;
			}
			const raw = await adapter.read(path);
			const dayCounts = parseDailyStatsDayCounts(raw);
			const { imported } = importDailyStatsHistory(this.data.history, dayCounts, this.settings.dailyGoal);

			this.markDirty({ refreshSidebar: true });
			await this.flushSave();
			new Notice(`Imported ${imported} Days From Daily Stats.`);
		} catch (err) {
			console.error("Import error:", err);
			new Notice("Import failed.");
		}
	}

	private async importDailyNoteWordCounts(range: DailyNoteWordCountImportRange) {
		try {
			const result = await importDailyNoteWordCountsFromVault(
				this.app,
				this.data.history,
				this.settings.dailyGoal,
				range
			);
			if (!result) {
				new Notice("Daily notes path is not configured.");
				return;
			}

			if (result.imported > 0) {
				this.markDirty({ refreshSidebar: true });
				await this.flushSave();
			}
			this.refreshUi();
			new Notice(
				`Checked ${result.checked} Daily Notes (${result.startDate} to ${result.endDate}). ` +
				`Imported ${result.imported}, skipped ${result.skipped}, missing ${result.missing}.`
			);
		} catch (err) {
			console.error("Daily note import error:", err);
			new Notice("Daily note import failed.");
		}
	}

	private updateStatusBar() {
		renderStatusBar(this.statusBarEl, this.todaysTotal(), this.settings);
	}

	async activateSidebar() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP);
		if (existing.length) {
			void this.app.workspace.revealLeaf(existing[0])
				.catch((err) => console.error("Failed to reveal writing heatmap leaf:", err));
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_HEATMAP, active: true });
			void this.app.workspace.revealLeaf(leaf)
				.catch((err) => console.error("Failed to reveal writing heatmap leaf:", err));
		}
	}

	refreshSidebar() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP)) {
			(leaf.view as SidebarHeatmapView).refresh();
		}
	}

	async openDailyNoteForDate(date: Date): Promise<boolean> {
		return openDailyNote(this.app, date);
	}

	async loadPluginData() {
		const { data, shouldOpenHeatmapOnFirstInstall } = await this.dataSync.load();
		this.data = data;
		this.shouldOpenHeatmapOnFirstInstall = shouldOpenHeatmapOnFirstInstall;
	}

	async savePluginData() {
		this.data = await this.dataSync.flush(this.data);
	}

	private applyMergedData(data: PluginDataShape<WordGoalSettings>): PluginDataShape<WordGoalSettings> {
		this.data = data;
		this.trackingController?.replaceActiveDay(this.data.activeDay, { preserveLastObserved: true });
		this.syncTodayHistory();
		return this.data;
	}

	private async fireWebhook() {
		try {
			const sent = await this.sendWebhook({ test: false });
			if (!shouldMarkWebhookHandled(this.settings, sent)) return;
			this.data.lastWebhookSentDate = this.data.activeDay.date;
			this.markDirty({ refreshSidebar: true });
			await this.flushSave();
		} finally {
			this.webhookSendInFlightDate = null;
		}
	}

	async sendTestWebhook() {
		await this.sendWebhook({ test: true });
	}

	private async sendWebhook({ test }: { test: boolean }): Promise<boolean> {
		return sendWebhook({
			settings: this.settings,
			actual: this.todaysTotal(),
			date: this.data.activeDay.date,
			test,
		});
	}
}
