import {
	Plugin,
	PluginSettingTab,
	App,
	Setting,
	Notice,
	TFile,
	ItemView,
	WorkspaceLeaf,
	WorkspaceMobileDrawer,
	Modal,
	setIcon,
	Editor,
	MarkdownView,
	requestUrl,
	ButtonComponent,
	moment,
	normalizePath,
} from "obsidian";
import { countMeaningfulWords } from "./src/counting";
import {
	createEmptyActiveDay,
	getTodayTotal,
	renameFileProgress,
	type DailyRecord,
	updateFileProgress,
} from "./src/daily-progress";
import { setTrackedEditorPath } from "./src/editor-cache";
import { resolveInitialSnapshotWords } from "./src/initial-snapshot";
import { PluginDataStore, type PluginDataShape } from "./src/plugin-data";

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_TYPE_HEATMAP = "word-goal-heatmap-view";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLOR_PRESETS: { label: string; hex: string }[] = [
	{ label: "Green",  hex: "#39d353" },
	{ label: "Teal",   hex: "#4ce0b3" },
	{ label: "Blue",   hex: "#4a9eff" },
	{ label: "Purple", hex: "#a78bfa" },
	{ label: "Pink",   hex: "#f472b6" },
	{ label: "Orange", hex: "#fb923c" },
	{ label: "Yellow", hex: "#facc15" },
	{ label: "Red",    hex: "#f87171" },
];

interface WordGoalSettings {
	webhookUrl: string;
	dailyGoal: number;
	heatmapColor: string;
	showGoalMetCue: boolean;
}

interface DailyNotePathConfig {
	format: string;
	folder: string;
}

type StreakCardState = "idle" | "active" | "best-active";

const DEFAULT_SETTINGS: WordGoalSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
};

const PLUGIN_DATA_VERSION = 2;
const BACKUP_FILE_COUNT = 3;
const DEBUG_OBSERVATION_DIAGNOSTICS = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in LOCAL timezone (not UTC!) */
function dateToKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function todayKey(): string { return dateToKey(new Date()); }

function isToday(date: Date): boolean {
	return dateToKey(date) === todayKey();
}

function runtimeLocale(): string {
	if (typeof window !== "undefined" && typeof window.navigator?.language === "string" && window.navigator.language.length > 0) {
		return window.navigator.language;
	}
	return Intl.DateTimeFormat().resolvedOptions().locale;
}

function formatLocalizedDate(date: Date, options: Intl.DateTimeFormatOptions): string {
	return date.toLocaleDateString(runtimeLocale(), options);
}

function formatLocalizedNumber(value: number): string {
	return value.toLocaleString(runtimeLocale());
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStreakCardState(current: number, longest: number): StreakCardState {
	if (current <= 0) return "idle";
	return current === longest ? "best-active" : "active";
}

/** Lerp between two hex colors */
function lerpColor(from: string, to: string, t: number): string {
	const f = [parseInt(from.slice(1, 3), 16), parseInt(from.slice(3, 5), 16), parseInt(from.slice(5, 7), 16)];
	const tC = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)];
	const r = Math.round(f[0] + (tC[0] - f[0]) * t);
	const g = Math.round(f[1] + (tC[1] - f[1]) * t);
	const b = Math.round(f[2] + (tC[2] - f[2]) * t);
	return `rgb(${r}, ${g}, ${b})`;
}

const LEVEL_ALPHA = [0, 0.3, 0.5, 0.75, 1.0];

function intensityLevel(words: number, max: number): number {
	if (words === 0) return 0;
	const ratio = words / max;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

function historyKeysByPredicate(
	history: Record<string, DailyRecord>,
	matches: (record: DailyRecord) => boolean,
	year?: number
): string[] {
	return Object.entries(history)
		.filter(([key, rec]) => matches(rec) && (year === undefined || key.startsWith(`${year}-`)))
		.map(([key]) => key)
		.sort();
}

function previousDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() - 1);
	return dateToKey(date);
}

function calcCurrentStreakFromSet(keys: Set<string>, anchor: Date): number {
	let current = 0;
	let cursor = new Date(anchor);
	let skippedAnchor = false;

	while (true) {
		const key = dateToKey(cursor);
		if (keys.has(key)) {
			current++;
			cursor.setDate(cursor.getDate() - 1);
			continue;
		}
		if (current === 0 && !skippedAnchor) {
			skippedAnchor = true;
			cursor.setDate(cursor.getDate() - 1);
			continue;
		}
		return current;
	}
}

function calcLongestStreak(keys: string[]): number {
	let longest = 0;
	let streak = 0;
	let prev: string | null = null;

	for (const key of keys) {
		if (prev && previousDayKey(key) === prev) {
			streak++;
		} else {
			streak = 1;
		}
		if (streak > longest) longest = streak;
		prev = key;
	}

	return longest;
}

function calcStreaksFromKeys(keys: string[], year?: number): { current: number; longest: number } {
	if (keys.length === 0) return { current: 0, longest: 0 };

	const keySet = new Set(keys);
	const anchor = year === undefined || year === new Date().getFullYear()
		? new Date()
		: new Date(year, 11, 31);

	return {
		current: calcCurrentStreakFromSet(keySet, anchor),
		longest: calcLongestStreak(keys),
	};
}

function calcStreaks(
	history: Record<string, DailyRecord>,
	matches: (record: DailyRecord) => boolean,
	year?: number
): { current: number; longest: number } {
	return calcStreaksFromKeys(historyKeysByPredicate(history, matches, year), year);
}

function isWritingDay(record: DailyRecord): boolean {
	return record.totalWords > 0;
}

function isGoalMetDay(record: DailyRecord): boolean {
	return record.goalMet === true;
}

function logObservationDiagnostic(event: string, details: Record<string, unknown>) {
	if (!DEBUG_OBSERVATION_DIAGNOSTICS) return;
	console.debug(`[word-goal][main] ${event}`, details);
}

function yearMax(history: Record<string, DailyRecord>, year: number): number {
	let max = 1;
	for (const [key, rec] of Object.entries(history)) {
		if (key.startsWith(`${year}-`) && rec.totalWords > max) max = rec.totalWords;
	}
	return max;
}

function yearStats(history: Record<string, DailyRecord>, year: number) {
	let total = 0, days = 0;
	for (const [key, rec] of Object.entries(history)) {
		if (!key.startsWith(`${year}-`)) continue;
		if (rec.totalWords > 0) { total += rec.totalWords; days++; }
	}
	return { total, days, avg: days > 0 ? Math.round(total / days) : 0 };
}

function getMonthlySums(history: Record<string, DailyRecord>, year: number): number[] {
	const sums = new Array(12).fill(0);
	for (const [key, rec] of Object.entries(history)) {
		if (!key.startsWith(`${year}-`)) continue;
		sums[parseInt(key.slice(5, 7), 10) - 1] += rec.totalWords;
	}
	return sums;
}

function getHeatmapCellState(
	history: Record<string, DailyRecord>,
	date: Date,
	max: number
): { words: number; level: number; goalMet: boolean } {
	const key = dateToKey(date);
	const record = history[key];
	const words = record?.totalWords ?? 0;
	return {
		words,
		level: intensityLevel(words, max),
		goalMet: record?.goalMet === true,
	};
}

/** Build the calendar grid data for a year. Returns weeks (arrays of 7 slots). */
function buildYearGrid(year: number): { dayIndex: number; date: Date | null }[][] {
	const jan1 = new Date(year, 0, 1);
	const startDow = (jan1.getDay() + 6) % 7;
	const dec31 = new Date(year, 11, 31);
	const totalDays = Math.floor((dec31.getTime() - jan1.getTime()) / 86400000) + 1;
	const totalSlots = startDow + totalDays;
	const totalWeeks = Math.ceil(totalSlots / 7);

	const weeks: { dayIndex: number; date: Date | null }[][] = [];
	for (let w = 0; w < totalWeeks; w++) {
		const week: { dayIndex: number; date: Date | null }[] = [];
		for (let dow = 0; dow < 7; dow++) {
			const di = w * 7 + dow - startDow;
			if (di < 0 || di >= totalDays) {
				week.push({ dayIndex: -1, date: null });
			} else {
				week.push({ dayIndex: di, date: new Date(year, 0, 1 + di) });
			}
		}
		weeks.push(week);
	}
	return weeks;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default class WordGoalWebhookPlugin extends Plugin {
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
	private pluginDataMtime: number | null = null;
	private saveTimer: number | null = null;
	private dirty = false;
	private pendingSidebarRefresh = false;
	private saveInFlight: Promise<void> | null = null;
	private filePathByEditor = new Map<Editor, string>();
	private editorByFilePath = new Map<string, Editor>();
	private lastObservedWordsByPath = new Map<string, number>();
	private hasCompletedInitialHydration = false;
	private celebrateGoalUntil = 0;
	private celebrateGoalTimer: number | null = null;

	get settings(): WordGoalSettings { return this.data.settings; }

	private getDataStore(): PluginDataStore<WordGoalSettings> {
		return new PluginDataStore(
			this.app.vault.adapter,
			this.getPluginDataPath(),
			this.getBackupPaths(),
			DEFAULT_SETTINGS,
			PLUGIN_DATA_VERSION,
			() => todayKey()
		);
	}

	async onload() {
		await this.loadPluginData();
		this.addSettingTab(new WordGoalSettingTab(this.app, this));
		this.handleDayRollover();

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

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor) => {
				this.trackEditorChange(editor);
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.refreshMarkdownEditorCache();
				void this.initializeSnapshotFromLeaf(leaf).catch((err) => console.error("Failed to initialize snapshot from active leaf:", err));
				this.updateStatusBar();
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				void this.handleVaultModify(file);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				this.handleFileRename(file, oldPath);
			})
		);

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("wg-statusbar");
		this.registerInterval(window.setInterval(() => this.updateStatusBar(), 1000));
		this.updateStatusBar();

		// Save when app goes to background (critical for mobile)
		this.visibilityHandler = () => {
			if (document.visibilityState === "hidden") {
				this.syncTodayHistory();
				this.markDirty({ refreshSidebar: true });
				void this.flushSave().catch((err) => console.error("Failed to flush plugin data on background:", err));
				return;
			}
			void this.reloadSyncedDataAndRefreshUi().catch((err) => console.error("Failed to reload synced plugin data:", err));
		};
		document.addEventListener("visibilitychange", this.visibilityHandler);

		this.app.workspace.onLayoutReady(() => {
			this.refreshMarkdownEditorCache();
			void this.handleLayoutReady().catch((err) => console.error("Failed during layout-ready initialization:", err));
		});
	}

	onunload() {
		document.removeEventListener("visibilitychange", this.visibilityHandler);
		if (this.celebrateGoalTimer !== null) {
			window.clearTimeout(this.celebrateGoalTimer);
			this.celebrateGoalTimer = null;
		}
		this.finalizeToday();
		this.markDirty({ refreshSidebar: false });
		void this.flushSave().catch((err) => console.error("Failed to flush plugin data on unload:", err));
	}

	// ── Today's total — computed from persisted snapshots ─────────────────

	todaysTotal(): number {
		return getTodayTotal(this.data.activeDay);
	}

	// ── Day rollover ─────────────────────────────────────────────────────

	private handleDayRollover() {
		const today = todayKey();
		if (this.data.activeDay.date && this.data.activeDay.date !== today) {
			this.finalizeDay(this.data.activeDay.date);
		}
		if (this.data.activeDay.date !== today) {
			this.data.activeDay = createEmptyActiveDay(today);
			this.lastObservedWordsByPath.clear();
			if (this.hasCompletedInitialHydration) {
				this.initializeOpenViewSnapshots();
			}
		}
		this.syncTodayHistory();
	}

	private finalizeDay(dateKey: string) {
		this.syncHistoryEntry(dateKey, this.todaysTotal());
	}

	private finalizeToday() {
		if (this.data.activeDay.date) {
			this.syncHistoryEntry(this.data.activeDay.date, this.todaysTotal());
		}
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

	private resolveMarkdownViewForEditor(editor: Editor): MarkdownView | null {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file && view.editor === editor) {
				return view;
			}
		}
		return null;
	}

	private ensureCurrentDay() {
		if (this.data.activeDay.date !== todayKey()) {
			this.handleDayRollover();
		}
	}

	private observeFileWords(file: TFile, words: number, source: string, observedAt = Date.now()) {
		this.ensureCurrentDay();
		const path = file.path;
		const previousWords = this.lastObservedWordsByPath.get(path);
		const existing = this.data.activeDay.files[path];
		// For a file first seen today, the current size is the baseline unless we already
		// observed an earlier count for that same path in this session.
		const baselineOverride = existing ? undefined : previousWords;
		logObservationDiagnostic("observe-file-words", {
			path,
			source,
			words,
			observedAt,
			previousWords,
			existingBaselineWords: existing?.baselineWords,
			existingLatestWords: existing?.latestWords,
			baselineOverride,
		});
		this.data.activeDay = updateFileProgress(
			this.data.activeDay,
			todayKey(),
			path,
			words,
			observedAt,
			baselineOverride
		);
		this.lastObservedWordsByPath.set(path, words);
	}

	private primeFileWords(file: TFile, words: number, source = "prime-file-words") {
		this.observeFileWords(file, words, source, Date.now());
	}

	private async initializeSnapshotFromLeaf(leaf: WorkspaceLeaf | null) {
		if (!leaf) return;
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const file = view.file;
		if (!file) return;
		if (!this.hasCompletedInitialHydration) return;
		const path = file.path;
		const initialSessionWords = this.lastObservedWordsByPath.get(path);
		const initialLatestObservedAt = this.data.activeDay.files[path]?.latestObservedAt;
		const editorWords = this.countEditorWords(file, view.editor);
		const storedWords = editorWords === 0 ? await this.countStoredFileWords(file) : editorWords;
		if (
			this.lastObservedWordsByPath.get(path) !== initialSessionWords ||
			this.data.activeDay.files[path]?.latestObservedAt !== initialLatestObservedAt
		) {
			return;
		}
		this.primeFileWords(file, resolveInitialSnapshotWords(editorWords, storedWords), "initialize-snapshot-from-leaf");
	}

	private initializeOpenViewSnapshots() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			void this.initializeSnapshotFromLeaf(leaf).catch((err) => console.error("Failed to initialize snapshot from open view:", err));
		}
	}

	private refreshMarkdownEditorCache() {
		this.filePathByEditor.clear();
		this.editorByFilePath.clear();

		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, view.editor, view.file.path);
		}
	}

	private countEditorWords(file: TFile, editor: Editor): number {
		return countMeaningfulWords(editor.getValue(), this.app.metadataCache.getCache(file.path));
	}

	private async countStoredFileWords(file: TFile): Promise<number> {
		const content = await this.app.vault.cachedRead(file);
		return countMeaningfulWords(content, this.app.metadataCache.getCache(file.path));
	}

	private async handleLayoutReady() {
		await this.reloadSyncedDataAndRefreshUi();
		this.hasCompletedInitialHydration = true;
		this.initializeOpenViewSnapshots();
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.refreshUi();
		await this.activateSidebar();
	}

	// ── Word tracking (fast, synchronous, runs on every keystroke) ───────

	private trackEditorChange(editor: Editor) {
		if (!this.hasCompletedInitialHydration) return;
		this.ensureCurrentDay();

		const view = this.resolveMarkdownViewForEditor(editor);
		const file = view?.file;
		if (!file || !(file instanceof TFile)) return;
		setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, editor, file.path);

		const words = this.countEditorWords(file, editor);
		if (this.lastObservedWordsByPath.get(file.path) === words && this.data.activeDay.files[file.path]?.latestWords === words) return;

		this.observeFileWords(file, words, "editor-change");
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();

		// Check goal
		this.maybeCelebrateGoal();
	}

	private async handleVaultModify(file: TFile) {
		if (!this.hasCompletedInitialHydration) return;
		await this.reloadAndMergeSyncedPluginData();
		const liveEditor = this.editorByFilePath.get(file.path);
		if (liveEditor) {
			const liveWords = this.countEditorWords(file, liveEditor);
			if (this.lastObservedWordsByPath.get(file.path) === liveWords && this.data.activeDay.files[file.path]?.latestWords === liveWords) return;
			this.observeFileWords(file, liveWords, "vault-modify-live-editor");
		} else {
			const words = await this.countStoredFileWords(file);
			if (this.lastObservedWordsByPath.get(file.path) === words && this.data.activeDay.files[file.path]?.latestWords === words) return;
			this.observeFileWords(file, words, "vault-modify-stored-file");
		}
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.updateStatusBar();
		this.maybeCelebrateGoal();
	}

	private handleFileRename(file: TFile, oldPath: string) {
		if (!this.hasCompletedInitialHydration) return;
		this.ensureCurrentDay();
		this.data.activeDay = renameFileProgress(this.data.activeDay, oldPath, file.path);
		const previousWords = this.lastObservedWordsByPath.get(oldPath);
		if (previousWords !== undefined) {
			this.lastObservedWordsByPath.delete(oldPath);
			this.lastObservedWordsByPath.set(file.path, previousWords);
		}
		const editor = this.editorByFilePath.get(oldPath);
		if (editor) {
			this.editorByFilePath.delete(oldPath);
			setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, editor, file.path);
		}
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.refreshUi();
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
			void this.fireWebhook();
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

	private getBackupPaths(): string[] {
		return Array.from({ length: BACKUP_FILE_COUNT }, (_, index) => (
			`${this.app.vault.configDir}/plugins/${this.manifest.id}/data.backup-${index + 1}.json`
		));
	}

	private async reloadAndMergeSyncedPluginData() {
		const path = this.getPluginDataPath();
		const stat = await this.app.vault.adapter.stat(path);
		if (!stat) return;
		if (this.pluginDataMtime !== null && stat.mtime <= this.pluginDataMtime) return;

		try {
			const incoming = await this.getDataStore().readAndValidate(path);
			if (!incoming) return;
			logObservationDiagnostic("merge-plugin-data-from-disk", {
				path,
				previousMtime: this.pluginDataMtime,
				incomingMtime: stat.mtime,
				incomingActiveDayDate: incoming.activeDay.date,
				incomingTrackedFiles: Object.keys(incoming.activeDay.files).length,
			});
			this.data = this.getDataStore().merge(this.data, incoming);
			this.syncTodayHistory();
			this.pluginDataMtime = stat.mtime;
		} catch (err) {
			console.error("Failed to reload synced plugin data:", err);
		}
	}

	private async reloadSyncedDataAndRefreshUi() {
		await this.reloadAndMergeSyncedPluginData();
		this.refreshUi();
	}

	// ── Debounced save (avoid hammering disk on every keystroke) ──────────

	markDirty(options?: { refreshSidebar?: boolean }) {
		this.dirty = true;
		if (options?.refreshSidebar) {
			this.pendingSidebarRefresh = true;
		}
	}

	private scheduleSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			void this.flushSave();
		}, 800);
	}

	async flushSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}

		if (this.saveInFlight) {
			await this.saveInFlight;
			return;
		}
		if (!this.dirty) return;

		this.saveInFlight = this.performSaveLoop();
		try {
			await this.saveInFlight;
		} finally {
			this.saveInFlight = null;
		}
	}

	private async performSaveLoop() {
		while (this.dirty) {
			this.dirty = false;
			await this.savePluginData();
		}
		if (this.pendingSidebarRefresh) {
			this.pendingSidebarRefresh = false;
			this.refreshSidebar();
		}
	}

	// ── Import from Daily Stats plugin ───────────────────────────────────

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
			const dsData = JSON.parse(raw);
			const dayCounts: Record<string, number> = dsData?.dayCounts ?? {};

			let imported = 0;
			for (const [dsKey, words] of Object.entries(dayCounts)) {
				if (typeof words !== "number" || words <= 0) continue;
				// daily-stats uses "YYYY/M/D" with 0-indexed months
				const parts = dsKey.split("/");
				if (parts.length !== 3) continue;
				const year = parseInt(parts[0], 10);
				const month = parseInt(parts[1], 10) + 1; // 0-indexed → 1-indexed
				const day = parseInt(parts[2], 10);
				const isoKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

				// Only import if we don't already have data for that day
				if (!this.data.history[isoKey] || this.data.history[isoKey].totalWords === 0) {
					this.data.history[isoKey] = {
						totalWords: words,
						goalMet: words >= this.settings.dailyGoal,
						updatedAt: 0,
					};
					imported++;
				}
			}

			this.markDirty({ refreshSidebar: true });
			await this.flushSave();
			new Notice(`Imported ${imported} Days From Daily Stats.`);
		} catch (err) {
			console.error("Import error:", err);
			new Notice("Import failed.");
		}
	}

	// ── Status bar ────────────────────────────────────────────────────────

	private updateStatusBar() {
		if (!this.statusBarEl) return;
		if (this.data.activeDay.date !== todayKey()) this.handleDayRollover();

		const total = this.todaysTotal();
		const goal = this.settings.dailyGoal;
		const pct = Math.min(total / goal, 1);
		const dotColor = lerpColor("#555555", this.settings.heatmapColor, pct);

		this.statusBarEl.empty();
		const dot = this.statusBarEl.createSpan({ cls: "wg-sb-dot" });
		dot.style.backgroundColor = dotColor;
		this.statusBarEl.createSpan({ text: ` ${total} / ${goal}`, cls: "wg-sb-text" });
	}

	// ── Sidebar ───────────────────────────────────────────────────────────

	async activateSidebar() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP);
		if (existing.length) { void this.app.workspace.revealLeaf(existing[0]); return; }
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_HEATMAP, active: true });
			void this.app.workspace.revealLeaf(leaf);
		}
	}

	refreshSidebar() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP)) {
			(leaf.view as SidebarHeatmapView).refresh();
		}
	}

	private getCoreDailyNotePathConfig(): DailyNotePathConfig | null {
		const internalPlugins = (this.app as App & {
			internalPlugins?: {
				getPluginById?: (id: string) => unknown;
				plugins?: Record<string, unknown>;
			};
		}).internalPlugins;
		const plugin = internalPlugins?.getPluginById?.("daily-notes")
			?? internalPlugins?.plugins?.["daily-notes"];
		const instance = (plugin as { instance?: { options?: unknown }; options?: unknown } | undefined)?.instance;
		const options = (instance?.options
			?? (plugin as { options?: unknown } | undefined)?.options) as { format?: unknown; folder?: unknown } | undefined;

		if (typeof options?.format !== "string" || options.format.trim().length === 0) {
			return null;
		}

		return {
			format: options.format.trim(),
			folder: typeof options.folder === "string" ? options.folder.trim() : "",
		};
	}

	private async getPeriodicDailyNotePathConfig(): Promise<DailyNotePathConfig | null> {
		const plugins = (this.app as App & {
			plugins?: {
				plugins?: Record<string, unknown>;
			};
		}).plugins;
		const plugin = plugins?.plugins?.["periodic-notes"] as
			| { settings?: { daily?: { format?: unknown; folder?: unknown } } }
			| undefined;
		const pluginDailySettings = plugin?.settings?.daily;

		if (typeof pluginDailySettings?.format === "string" && pluginDailySettings.format.trim().length > 0) {
			return {
				format: pluginDailySettings.format.trim(),
				folder: typeof pluginDailySettings.folder === "string" ? pluginDailySettings.folder.trim() : "",
			};
		}

		try {
			const path = `${this.app.vault.configDir}/plugins/periodic-notes/data.json`;
			const exists = await this.app.vault.adapter.exists(path);
			if (!exists) return null;

			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as { daily?: { format?: unknown; folder?: unknown } };
			if (typeof parsed.daily?.format !== "string" || parsed.daily.format.trim().length === 0) {
				return null;
			}

			return {
				format: parsed.daily.format.trim(),
				folder: typeof parsed.daily.folder === "string" ? parsed.daily.folder.trim() : "",
			};
		} catch (err) {
			console.error("Failed to read Periodic Notes settings:", err);
			return null;
		}
	}

	private buildDailyNotePathForDate(date: Date, config: DailyNotePathConfig): string | null {
		if (config.format.trim().length === 0) return null;

		// The configured format can itself contain path separators, so treat it as a full path fragment.
		const formattedPath = moment(date).format(config.format);
		if (formattedPath.trim().length === 0) return null;

		const combinedPath = config.folder
			? normalizePath(`${config.folder}/${formattedPath}`)
			: normalizePath(formattedPath);

		return combinedPath.endsWith(".md") ? combinedPath : `${combinedPath}.md`;
	}

	private async resolveDailyNotePathForDate(date: Date): Promise<string | null> {
		const periodicConfig = await this.getPeriodicDailyNotePathConfig();
		if (periodicConfig) {
			return this.buildDailyNotePathForDate(date, periodicConfig);
		}

		const coreConfig = this.getCoreDailyNotePathConfig();
		if (coreConfig) {
			return this.buildDailyNotePathForDate(date, coreConfig);
		}

		return null;
	}

	async openDailyNoteForDate(date: Date): Promise<boolean> {
		const path = await this.resolveDailyNotePathForDate(date);
		if (!path) return false;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return false;

		const leaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)
			?? this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		return true;
	}

	// ── Persistence ───────────────────────────────────────────────────────

	async loadPluginData() {
		const { data, sourcePath } = await this.getDataStore().loadBestAvailable();
		this.data = data;
		const stat = await this.app.vault.adapter.stat(this.getPluginDataPath());
		if (stat) {
			this.pluginDataMtime = stat.mtime;
		} else if (sourcePath) {
			const sourceStat = await this.app.vault.adapter.stat(sourcePath);
			this.pluginDataMtime = sourceStat?.mtime ?? null;
		} else {
			this.pluginDataMtime = null;
		}
	}

	async savePluginData() {
		await this.savePluginDataSafely();
		const stat = await this.app.vault.adapter.stat(this.getPluginDataPath());
		this.pluginDataMtime = stat?.mtime ?? this.pluginDataMtime;
	}

	private async savePluginDataSafely() {
		const diskData = await this.getDataStore().loadBestAvailable();
		if (diskData.sourcePath) {
			this.data = this.getDataStore().merge(this.data, diskData.data);
			this.syncTodayHistory();
		}
		await this.getDataStore().saveSafely(this.data);
	}

	// ── Webhook ───────────────────────────────────────────────────────────

	private async fireWebhook() {
		try {
			const sent = await this.sendWebhook({ test: false });
			if (!sent) return;
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
		const url = this.settings.webhookUrl.trim();
		if (!url) {
			new Notice(test ? "Word Goal: No Webhook URL Configured for Test." : "Word Goal: No Webhook URL Configured.");
			return false;
		}
		try {
			await requestUrl({
				url,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					event: "daily_word_goal_reached",
					goal: this.settings.dailyGoal,
					actual: this.todaysTotal(),
					date: this.data.activeDay.date,
					timestamp: new Date().toISOString(),
					test,
				}),
			});
			new Notice(test ? "Word Goal: Test Webhook Sent ✓" : "Word Goal: Webhook Sent ✓");
			return true;
		} catch (err) {
			console.error("Word Goal webhook error:", err);
			new Notice(test ? "Word Goal: Test Webhook Failed." : "Word Goal: Webhook Failed.");
			return false;
		}
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// SIDEBAR — minimal vertical heatmap
// ═════════════════════════════════════════════════════════════════════════════

class SidebarHeatmapView extends ItemView {
	plugin: WordGoalWebhookPlugin;
	private shouldScrollToToday = false;

	constructor(leaf: WorkspaceLeaf, plugin: WordGoalWebhookPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return VIEW_TYPE_HEATMAP; }
		getDisplayText() { return "Writing heatmap"; }
	getIcon() { return "flame"; }
	onOpen(): Promise<void> {
		this.shouldScrollToToday = true;
		this.refresh();
		return Promise.resolve();
	}

	refresh() {
		const root = this.contentEl;
		root.empty();
		root.addClass("wg-sidebar");

		const year = new Date().getFullYear();
		const history = this.plugin.data.history;
		const color = this.plugin.settings.heatmapColor;

		// ── Top bar ──
		const topBar = root.createDiv({ cls: "wg-sb-topbar" });
		topBar.createDiv({ text: "Writing heatmap", cls: "wg-sb-title" });
		const expandBtn = topBar.createEl("button", { cls: "wg-sb-expand-btn" });
		setIcon(expandBtn, "maximize-2");
		expandBtn.setAttribute("aria-label", "Open detailed stats");
		expandBtn.addEventListener("click", () => new DetailModal(this.app, this.plugin).open());

		// ── Today counter (live from in-memory snapshots) ──
		const todayWords = this.plugin.todaysTotal();
		const goal = this.plugin.settings.dailyGoal;
		const isOverGoal = todayWords > goal;
		const fillRatio = Math.min(todayWords / goal, 1);
		const goalRatio = isOverGoal ? goal / todayWords : 1;
		const todayEl = root.createDiv({ cls: "wg-sb-today" });
		todayEl.style.setProperty("--wg-progress-color", color);
		todayEl.style.setProperty("--wg-progress-color-soft", hexToRgba(color, 0.18));
		todayEl.style.setProperty("--wg-progress-color-glow", hexToRgba(color, 0.32));
		if (this.plugin.isGoalCelebrating()) {
			todayEl.addClass("wg-sb-today-celebrate");
		}
		todayEl.createSpan({ text: `${todayWords}`, cls: "wg-sb-today-num" });
		const goalEl = todayEl.createSpan({ text: ` / ${goal}`, cls: "wg-sb-today-goal" });
		if (isOverGoal) {
			goalEl.addClass("wg-sb-today-goal-overflow");
		}
		const progressBar = todayEl.createDiv({ cls: "wg-sb-progress" });
		if (isOverGoal) {
			progressBar.addClass("wg-sb-progress-overgoal");
		}
		progressBar.style.setProperty("--wg-progress-fill-ratio", String(fillRatio));
		progressBar.style.setProperty("--wg-progress-goal-ratio", String(goalRatio));
		progressBar.setAttribute("role", "progressbar");
		progressBar.setAttribute("aria-label", "Today's writing progress");
		progressBar.setAttribute("aria-valuemin", "0");
		progressBar.setAttribute("aria-valuemax", String(Math.max(todayWords, goal)));
		progressBar.setAttribute("aria-valuenow", String(todayWords));
		progressBar.setAttribute("aria-valuetext", `${formatLocalizedNumber(todayWords)} Words Written, ${formatLocalizedNumber(goal)} Word Goal`);
		const progressFill = progressBar.createDiv({ cls: "wg-sb-progress-fill" });
		progressFill.setAttribute("aria-hidden", "true");
		const progressDivider = progressBar.createDiv({ cls: "wg-sb-progress-divider" });
		progressDivider.setAttribute("aria-hidden", "true");

		// ── Vertical heatmap (no month labels — just dots filling full width) ──
		const max = yearMax(history, year);
		const weeks = buildYearGrid(year);

		const gridContainer = root.createDiv({ cls: "wg-sb-grid-container" });
		const grid = gridContainer.createDiv({ cls: "wg-sb-grid" });

		for (let w = 0; w < weeks.length; w++) {
			const row = grid.createDiv({ cls: "wg-sb-row" });
			for (const slot of weeks[w]) {
				if (!slot.date) {
					row.createDiv({ cls: "wg-sb-cell wg-sb-blank" });
					continue;
				}

				const { words, level, goalMet } = getHeatmapCellState(history, slot.date, max);
				const cell = row.createDiv({ cls: "wg-sb-cell" });

				if (level > 0) {
					cell.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[level]);
				} else {
					cell.addClass("wg-sb-cell-empty");
				}
				if (goalMet && this.plugin.settings.showGoalMetCue) cell.addClass("wg-cell-goal-met");
				if (isToday(slot.date)) {
					cell.addClass("wg-day-today");
					cell.style.setProperty("--wg-today-accent", color);
				}

				const dateStr = formatLocalizedDate(slot.date, { day: "numeric", month: "short" });
				cell.dataset.tooltip = `${dateStr}: ${words}`;
				cell.addClass("wg-tooltip");
				cell.addClass("wg-sb-cell-clickable");
				cell.tabIndex = 0;
				cell.setAttribute("role", "button");
				cell.setAttribute("aria-label", `Open daily note for ${dateStr}`);

				const openDailyNote = () => {
					void this.openDailyNoteFromSidebar(slot.date).catch((err) => {
						console.error("Failed to open daily note from sidebar:", err);
					});
				};
				cell.addEventListener("click", openDailyNote);
				cell.addEventListener("keydown", (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					openDailyNote();
				});
			}
		}

		if (this.shouldScrollToToday) {
			this.shouldScrollToToday = false;
			window.requestAnimationFrame(() => {
				const todayCell = gridContainer.querySelector<HTMLElement>(".wg-day-today");
				todayCell?.scrollIntoView({ block: "center", inline: "nearest" });
			});
		}

		// ── Streak section at bottom ──
		const streakSection = root.createDiv({ cls: "wg-sb-streak-section" });
		const writing = calcStreaks(history, isWritingDay);
		const goalMet = calcStreaks(history, isGoalMetDay);
		const streakRow = streakSection.createDiv({ cls: "wg-sb-streaks" });
			this.streakCard(streakRow, "✍", "Writing Streak", writing.current, writing.longest, color);
			this.streakCard(streakRow, "🎯", "Goal Streak", goalMet.current, goalMet.longest, color);
	}

	private async openDailyNoteFromSidebar(date: Date): Promise<void> {
		const opened = await this.plugin.openDailyNoteForDate(date);
		if (!opened || !this.app.isMobile) return;

		this.collapseMobileSidebar();
	}

	private collapseMobileSidebar(): void {
		if (this.leaf.parent instanceof WorkspaceMobileDrawer) {
			this.leaf.parent.collapse();
			return;
		}

		this.app.workspace.rightSplit.collapse();
	}

	private streakCard(parent: HTMLElement, icon: string, title: string, current: number, longest: number, color: string) {
		const state = getStreakCardState(current, longest);
		const card = parent.createDiv({ cls: "wg-sb-streak-card" });
		card.addClass(`wg-sb-streak-card-${state}`);
		card.style.setProperty("--wg-streak-accent", color);
		card.style.setProperty("--wg-streak-accent-soft", hexToRgba(color, 0.35));
		card.style.setProperty("--wg-streak-accent-strong", hexToRgba(color, 0.95));
		card.style.setProperty("--wg-streak-text-accent", state === "best-active" ? color : hexToRgba(color, 0.8));
		const header = card.createDiv({ cls: "wg-sb-streak-card-header" });
		header.createSpan({ text: icon, cls: "wg-sb-streak-card-icon" });
		header.createSpan({ text: title, cls: "wg-sb-streak-card-title" });
		card.createDiv({ text: `${current} Days`, cls: "wg-sb-streak-card-current" });
		card.createDiv({ text: `Best: ${longest} Days`, cls: "wg-sb-streak-card-best" });
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// DETAIL MODAL
// ═════════════════════════════════════════════════════════════════════════════

class DetailModal extends Modal {
	plugin: WordGoalWebhookPlugin;
	private displayYear: number;

	constructor(app: App, plugin: WordGoalWebhookPlugin) {
		super(app);
		this.plugin = plugin;
		this.displayYear = new Date().getFullYear();
	}

	onOpen() { this.modalEl.addClass("wg-detail-modal"); this.render(); }
	onClose() { this.contentEl.empty(); }

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const history = this.plugin.data.history;
		const year = this.displayYear;
		const currentYear = new Date().getFullYear();
		const color = this.plugin.settings.heatmapColor;

		// ── Year nav ──
		const nav = contentEl.createDiv({ cls: "wg-dt-nav" });
		const btnPrev = nav.createEl("button", { text: "←", cls: "wg-dt-nav-btn" });
		btnPrev.addEventListener("click", () => { this.displayYear--; this.render(); });
		nav.createSpan({ text: `${year}`, cls: "wg-dt-year" });
		const btnNext = nav.createEl("button", { text: "→", cls: "wg-dt-nav-btn" });
		btnNext.disabled = year >= currentYear;
		btnNext.addEventListener("click", () => {
			if (this.displayYear >= currentYear) return;
			this.displayYear++;
			this.render();
		});

		// ── Stats cards (numbers in chosen color) ──
		const stats = yearStats(history, year);
		const statsRow = contentEl.createDiv({ cls: "wg-dt-stats" });

		this.statCard(statsRow, formatLocalizedNumber(stats.total), "Total Words", color);
		this.statCard(statsRow, `${stats.days}`, "Days Written", color);
		this.statCard(statsRow, formatLocalizedNumber(stats.avg), "Daily Average", color);

		// ── Horizontal heatmap ──
		const max = yearMax(history, year);
		const weeks = buildYearGrid(year);

		// Single scrollable wrapper for months + grid
		const scrollWrap = contentEl.createDiv({ cls: "wg-dt-scroll-wrap" });

		// Inner container that has the actual width
		const scrollInner = scrollWrap.createDiv({ cls: "wg-dt-scroll-inner" });

		// Heatmap grid (inside scroll)
		const heatWrap = scrollInner.createDiv({ cls: "wg-dt-heatmap" });

		// Day labels
		const dayLabels = heatWrap.createDiv({ cls: "wg-dt-daylabels" });
		for (const d of ["Mon", "", "Wed", "", "Fri", "", ""]) {
			dayLabels.createDiv({ cls: "wg-dt-daylabel", text: d });
		}

		const grid = heatWrap.createDiv({ cls: "wg-dt-grid" });
		for (let w = 0; w < weeks.length; w++) {
			const col = grid.createDiv({ cls: "wg-dt-col" });
			for (const slot of weeks[w]) {
				if (!slot.date) { col.createDiv({ cls: "wg-dt-cell wg-dt-blank" }); continue; }

				const { words, level, goalMet } = getHeatmapCellState(history, slot.date, max);
				const cell = col.createDiv({ cls: "wg-dt-cell" });

				if (level > 0) {
					cell.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[level]);
				} else {
					cell.addClass("wg-dt-cell-zero");
				}
				if (goalMet && this.plugin.settings.showGoalMetCue) cell.addClass("wg-cell-goal-met");
				if (isToday(slot.date)) {
					cell.addClass("wg-day-today");
					cell.style.setProperty("--wg-today-accent", color);
				}

				const dateStr = formatLocalizedDate(slot.date, {
					weekday: "short", day: "numeric", month: "short", year: "numeric",
				});
				cell.dataset.tooltip = `${dateStr}: ${words} Words`;
				cell.addClass("wg-tooltip");
			}
		}

		// Legend
		const legend = contentEl.createDiv({ cls: "wg-dt-legend" });
		legend.createSpan({ text: "Less", cls: "wg-dt-legend-text" });
		for (let i = 0; i <= 4; i++) {
			const c = legend.createDiv({ cls: "wg-dt-cell wg-dt-legend-cell" });
			if (i > 0) c.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[i]);
			else c.addClass("wg-dt-cell-zero");
		}
		legend.createSpan({ text: "More", cls: "wg-dt-legend-text" });

		// ── Monthly breakdown with bar chart ──
		const sums = getMonthlySums(history, year);
		const maxMonth = Math.max(...sums, 1);
		const monthlyWrap = contentEl.createDiv({ cls: "wg-dt-monthly" });
			monthlyWrap.createEl("h4", { text: "Monthly breakdown", cls: "wg-dt-monthly-title" });

		const monthGrid = monthlyWrap.createDiv({ cls: "wg-dt-month-grid" });
		for (let i = 0; i < 12; i++) {
			const row = monthGrid.createDiv({ cls: "wg-dt-month-row" });
			row.createSpan({ text: MONTHS[i], cls: "wg-dt-month-name" });
			const barWrap = row.createDiv({ cls: "wg-dt-bar-wrap" });
			const bar = barWrap.createDiv({ cls: "wg-dt-bar" });
			bar.style.width = `${(sums[i] / maxMonth) * 100}%`;
			bar.style.backgroundColor = hexToRgba(color, 0.7);
			row.createSpan({ text: formatLocalizedNumber(sums[i]), cls: "wg-dt-month-val" });
		}
	}

	private statCard(parent: HTMLElement, value: string, label: string, color: string) {
		const card = parent.createDiv({ cls: "wg-dt-stat" });
		const num = card.createDiv({ text: value, cls: "wg-dt-stat-num" });
		num.style.color = color;
		for (const line of label.split("\n")) {
			card.createDiv({ text: line, cls: "wg-dt-stat-label" });
		}
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

class WordGoalSettingTab extends PluginSettingTab {
	plugin: WordGoalWebhookPlugin;

	constructor(app: App, plugin: WordGoalWebhookPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async persistWebhookUrl(value: string) {
		this.plugin.settings.webhookUrl = value;
		this.plugin.markDirty({ refreshSidebar: false });
		await this.plugin.flushSave();
	}

	private async runTestWebhook(button: ButtonComponent) {
		button.setDisabled(true);
		try {
			await this.plugin.sendTestWebhook();
		} finally {
			button.setDisabled(false);
		}
	}

	private async persistDailyWordGoal(value: string) {
		const n = parseInt(value, 10);
		if (isNaN(n) || n <= 0) return;

		this.plugin.settings.dailyGoal = n;
		this.plugin.syncTodayHistory();
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	private async applyHeatmapColor(hex: string) {
		this.plugin.settings.heatmapColor = hex;
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
		this.display();
	}

	private async persistGoalMetCue(value: boolean) {
		this.plugin.settings.showGoalMetCue = value;
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Webhook").setHeading();

		new Setting(containerEl)
			.setName("Webhook URL")
			.setDesc("Post endpoint for the daily goal notification")
			.addText((t) => t
				.setPlaceholder("https://hook.example.com/...")
				.setValue(this.plugin.settings.webhookUrl)
				.onChange((v) => {
					void this.persistWebhookUrl(v).catch((err) => console.error("Failed to save webhook URL:", err));
				})
			);

		new Setting(containerEl)
			.setName("Test webhook")
			.setDesc("Send a test payload to confirm your webhook setup")
			.addButton((button) => button
				.setButtonText("Send test webhook")
				.onClick(() => {
					void this.runTestWebhook(button).catch((err) => console.error("Failed to send test webhook:", err));
				})
			);

		new Setting(containerEl)
			.setName("Daily word goal")
			.setDesc("New words needed to trigger the webhook")
			.addText((t) => t
				.setPlaceholder("500")
				.setValue(String(this.plugin.settings.dailyGoal))
				.onChange((v) => {
					void this.persistDailyWordGoal(v).catch((err) => console.error("Failed to save daily word goal:", err));
				})
			);

		new Setting(containerEl).setName("Heatmap").setHeading();

		// Color preset picker
		const colorSetting = new Setting(containerEl)
			.setName("Heatmap colour")
			.setDesc("Choose a colour for the heatmap");

		const swatchContainer = colorSetting.controlEl.createDiv({ cls: "wg-color-swatches" });
		for (const preset of COLOR_PRESETS) {
			const swatch = swatchContainer.createDiv({ cls: "wg-color-swatch" });
			swatch.style.backgroundColor = preset.hex;
			swatch.setAttribute("aria-label", preset.label);

			if (this.plugin.settings.heatmapColor === preset.hex) {
				swatch.addClass("wg-swatch-active");
			}

			swatch.addEventListener("click", () => {
				void this.applyHeatmapColor(preset.hex).catch((err) => console.error("Failed to save heatmap colour:", err));
			});
		}

		new Setting(containerEl)
			.setName("Goal-met visual cue")
			.setDesc("Show the small marker on days where the daily word goal was met")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showGoalMetCue)
				.onChange((value) => {
					void this.persistGoalMetCue(value).catch((err) => console.error("Failed to save goal-met cue setting:", err));
				})
			);
	}
}
