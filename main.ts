import {
	Plugin,
	PluginSettingTab,
	App,
	Setting,
	Notice,
	TFile,
	ItemView,
	WorkspaceLeaf,
	Modal,
	setIcon,
	Editor,
	MarkdownView,
	requestUrl,
	ButtonComponent,
} from "obsidian";

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

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface FileSnapshot {
	initial: number;
	peak: number;
	current?: number;
}

interface DailyRecord {
	totalWords: number;
	goalMet?: boolean;
}

interface PluginData {
	settings: WordGoalSettings;
	/** Completed days: key = "YYYY-MM-DD" */
	history: Record<string, DailyRecord>;
	/** Today's per-file tracking — persisted to survive restarts */
	todaysWordCount: Record<string, FileSnapshot>;
	/** Which day todaysWordCount belongs to */
	todaysDate: string;
	/** Which day already triggered the webhook */
	lastWebhookSentDate: string;
}

interface WordGoalSettings {
	webhookUrl: string;
	dailyGoal: number;
	heatmapColor: string;
	showGoalMetCue: boolean;
}

type StreakCardState = "idle" | "active" | "best-active";

const DEFAULT_SETTINGS: WordGoalSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
};

const DEFAULT_DATA: PluginData = {
	settings: { ...DEFAULT_SETTINGS },
	history: {},
	todaysWordCount: {},
	todaysDate: "",
	lastWebhookSentDate: "",
};

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

function countWords(text: string): number { return (text.match(/\S+/g) || []).length; }

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
	data: PluginData = {
		settings: { ...DEFAULT_SETTINGS },
		history: {},
		todaysWordCount: {},
		todaysDate: "",
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
	private activeMarkdownEditor: Editor | null = null;
	private celebrateGoalUntil = 0;
	private celebrateGoalTimer: number | null = null;

	get settings(): WordGoalSettings { return this.data.settings; }

	async onload() {
		await this.loadPluginData();
		this.addSettingTab(new WordGoalSettingTab(this.app, this));
		this.handleDayRollover();

		this.registerView(VIEW_TYPE_HEATMAP, (leaf) => new SidebarHeatmapView(leaf, this));

			this.addCommand({
				id: "open-writing-heatmap",
				name: "Open Writing Heatmap",
				callback: () => {
					void this.activateSidebar().catch((err) => console.error("Failed to open writing heatmap:", err));
				},
			});
			this.addCommand({ id: "open-writing-stats", name: "Open Writing Stats", callback: () => new DetailModal(this.app, this).open() });
			this.addCommand({ id: "show-daily-word-count", name: "Show Today's Word Count", callback: () => new Notice(`Today: ${this.todaysTotal()} / ${this.settings.dailyGoal} Words`) });
				this.addCommand({
					id: "import-daily-stats",
					name: "Import History From Daily Stats Plugin",
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
				this.initializeSnapshotFromLeaf(leaf);
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
			this.initializeOpenViewSnapshots();
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
		let sum = 0;
		for (const snap of Object.values(this.data.todaysWordCount)) {
			sum += Math.max(snap.peak - snap.initial, 0);
		}
		return sum;
	}

	// ── Day rollover ─────────────────────────────────────────────────────

	private handleDayRollover() {
		const today = todayKey();
		if (this.data.todaysDate && this.data.todaysDate !== today) {
			// Finalize yesterday's count into history
			this.finalizeDay(this.data.todaysDate);
		}
		if (this.data.todaysDate !== today) {
			this.data.todaysDate = today;
			this.data.todaysWordCount = {};
		}
		this.syncTodayHistory();
	}

	private finalizeDay(dateKey: string) {
		this.syncHistoryEntry(dateKey, this.todaysTotal());
	}

	private finalizeToday() {
		if (this.data.todaysDate) {
			this.syncHistoryEntry(this.data.todaysDate, this.todaysTotal());
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
			};
			return;
		}
		if (existing?.totalWords && existing.totalWords > 0) return;
		delete this.data.history[dateKey];
	}

	private resolveMarkdownViewForEditor(editor: Editor): MarkdownView | null {
		const path = this.filePathByEditor.get(editor);
		if (!path) return null;
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path && view.editor === editor) {
				return view;
			}
		}
		return null;
	}

	private ensureCurrentDay() {
		if (this.data.todaysDate !== todayKey()) {
			this.handleDayRollover();
		}
	}

	private observeFileWords(file: TFile, words: number) {
		this.ensureCurrentDay();
		const path = file.path;
		this.lastObservedWordsByPath.set(path, words);
		const existing = this.data.todaysWordCount[path];
		if (!existing) {
			this.data.todaysWordCount[path] = { initial: words, peak: words };
			return;
		}

		existing.peak = Math.max(existing.peak, words);
		existing.current = words;
	}

	private initializeSnapshotFromLeaf(leaf: WorkspaceLeaf | null) {
		if (!leaf) return;
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			this.activeMarkdownEditor = null;
			return;
		}
		const file = view.file;
		if (!file) return;
		this.activeMarkdownEditor = view.editor;
		this.observeFileWords(file, countWords(view.editor.getValue()));
	}

	private initializeOpenViewSnapshots() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			this.initializeSnapshotFromLeaf(leaf);
		}
	}

	private refreshMarkdownEditorCache() {
		this.filePathByEditor.clear();
		this.editorByFilePath.clear();

		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			this.filePathByEditor.set(view.editor, view.file.path);
			this.editorByFilePath.set(view.file.path, view.editor);
		}
	}

	private async handleLayoutReady() {
		await this.reloadSyncedDataAndRefreshUi();
		await this.activateSidebar();
	}

	// ── Word tracking (fast, synchronous, runs on every keystroke) ───────

	private trackEditorChange(editor: Editor) {
		this.ensureCurrentDay();

		if (this.activeMarkdownEditor !== editor && !this.filePathByEditor.has(editor)) return;

		const view = this.resolveMarkdownViewForEditor(editor);
		const file = view?.file;
		if (!file || !(file instanceof TFile)) return;

		const words = countWords(editor.getValue());
		if (this.lastObservedWordsByPath.get(file.path) === words) return;

		this.observeFileWords(file, words);
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();

		// Check goal
		this.maybeCelebrateGoal();
	}

	private async handleVaultModify(file: TFile) {
		await this.reloadAndMergeSyncedPluginData();
		const liveEditor = this.editorByFilePath.get(file.path);
		if (liveEditor) {
			const liveWords = countWords(liveEditor.getValue());
			if (this.lastObservedWordsByPath.get(file.path) === liveWords) return;
			this.observeFileWords(file, liveWords);
		} else {
			const words = countWords(await this.app.vault.cachedRead(file));
			if (this.lastObservedWordsByPath.get(file.path) === words) return;
			this.observeFileWords(file, words);
		}
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.updateStatusBar();
		this.maybeCelebrateGoal();
	}

	private handleFileRename(file: TFile, oldPath: string) {
		this.ensureCurrentDay();
		const existing = this.data.todaysWordCount[oldPath];
		if (!existing || oldPath === file.path) return;

		const renamed = this.data.todaysWordCount[file.path];
		this.data.todaysWordCount[file.path] = renamed
			? this.mergeSnapshot(existing, renamed)
			: existing;
		delete this.data.todaysWordCount[oldPath];
		const previousWords = this.lastObservedWordsByPath.get(oldPath);
		if (previousWords !== undefined) {
			this.lastObservedWordsByPath.delete(oldPath);
			this.lastObservedWordsByPath.set(file.path, previousWords);
		}
		const editor = this.editorByFilePath.get(oldPath);
		if (editor) {
			this.editorByFilePath.delete(oldPath);
			this.editorByFilePath.set(file.path, editor);
			this.filePathByEditor.set(editor, file.path);
		}
		this.syncTodayHistory();
		this.markDirty({ refreshSidebar: true });
		this.scheduleSave();
		this.refreshUi();
	}

	private maybeCelebrateGoal() {
		if (
			this.todaysTotal() >= this.settings.dailyGoal &&
			this.data.lastWebhookSentDate !== this.data.todaysDate &&
			this.webhookSendInFlightDate !== this.data.todaysDate
		) {
			this.webhookSendInFlightDate = this.data.todaysDate;
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

	private mergeSnapshot(a: FileSnapshot, b: FileSnapshot): FileSnapshot {
		return {
			initial: Math.min(a.initial, b.initial),
			peak: Math.max(a.peak, b.peak),
			current: Math.max(a.current ?? a.peak, b.current ?? b.peak),
		};
	}

	private mergeHistoryEntry(local: DailyRecord | undefined, incoming: DailyRecord | undefined): DailyRecord | undefined {
		if (!local) return incoming ? { ...incoming } : undefined;
		if (!incoming) return local;
		return {
			totalWords: Math.max(local.totalWords, incoming.totalWords),
			goalMet: local.goalMet === true || incoming.goalMet === true,
		};
	}

	private mergePluginData(incoming: PluginData) {
		const today = todayKey();
		this.ensureCurrentDay();

		for (const [dateKey, incomingRecord] of Object.entries(incoming.history ?? {})) {
			const merged = this.mergeHistoryEntry(this.data.history[dateKey], incomingRecord);
			if (merged) this.data.history[dateKey] = merged;
		}

		if (incoming.todaysDate === today) {
			for (const [path, incomingSnapshot] of Object.entries(incoming.todaysWordCount ?? {})) {
				const localSnapshot = this.data.todaysWordCount[path];
				this.data.todaysWordCount[path] = localSnapshot
					? this.mergeSnapshot(localSnapshot, incomingSnapshot)
					: { ...incomingSnapshot };
			}
		}

		if ((incoming.lastWebhookSentDate ?? "") > (this.data.lastWebhookSentDate ?? "")) {
			this.data.lastWebhookSentDate = incoming.lastWebhookSentDate;
		}

		this.syncTodayHistory();
	}

	private async reloadAndMergeSyncedPluginData() {
		const path = this.getPluginDataPath();
		const stat = await this.app.vault.adapter.stat(path);
		if (!stat) return;
		if (this.pluginDataMtime !== null && stat.mtime <= this.pluginDataMtime) return;

		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw);
			const incoming = this.normalizeLoadedData(parsed);
			this.mergePluginData(incoming);
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
						new Notice("Daily Stats Plugin data.json Not Found.");
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
					};
					imported++;
				}
			}

			this.markDirty({ refreshSidebar: true });
			await this.flushSave();
			new Notice(`Imported ${imported} Days From Daily Stats.`);
		} catch (err) {
			console.error("Import error:", err);
			new Notice("Import Failed.");
		}
	}

	// ── Status bar ────────────────────────────────────────────────────────

	private updateStatusBar() {
		if (!this.statusBarEl) return;
		if (this.data.todaysDate !== todayKey()) this.handleDayRollover();

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

	// ── Persistence ───────────────────────────────────────────────────────

	async loadPluginData() {
		const loaded = await this.loadData();
		this.data = this.normalizeLoadedData(loaded);
		const stat = await this.app.vault.adapter.stat(this.getPluginDataPath());
		this.pluginDataMtime = stat?.mtime ?? null;
		this.mergePluginData(this.data);
	}

	private normalizeLoadedData(loaded: Partial<PluginData> | null | undefined): PluginData {
		const data = Object.assign({}, DEFAULT_DATA, loaded);
		data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		data.history = data.history ?? {};
		data.todaysWordCount = data.todaysWordCount ?? {};
		data.todaysDate = data.todaysDate ?? "";
		data.lastWebhookSentDate = data.lastWebhookSentDate ?? "";

		for (const record of Object.values(data.history)) {
			if (record.totalWords > 0 && record.goalMet === undefined) {
				record.goalMet = record.totalWords >= data.settings.dailyGoal;
			}
		}

		for (const [path, snapshot] of Object.entries(data.todaysWordCount)) {
			const migrated = snapshot as FileSnapshot & { current?: number; peak?: number };
			const initial = typeof migrated.initial === "number" ? migrated.initial : 0;
			const peakCandidate = typeof migrated.peak === "number"
				? migrated.peak
				: typeof migrated.current === "number"
					? migrated.current
					: initial;
			data.todaysWordCount[path] = {
				initial,
				peak: Math.max(initial, peakCandidate),
				current: typeof migrated.current === "number" ? migrated.current : peakCandidate,
			};
		}

		return data;
	}

	async savePluginData() {
		await this.saveData(this.data);
		const stat = await this.app.vault.adapter.stat(this.getPluginDataPath());
		this.pluginDataMtime = stat?.mtime ?? this.pluginDataMtime;
	}

	// ── Webhook ───────────────────────────────────────────────────────────

	private async fireWebhook() {
		try {
			const sent = await this.sendWebhook({ test: false });
			if (!sent) return;
			this.data.lastWebhookSentDate = this.data.todaysDate;
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
					date: this.data.todaysDate,
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
		getDisplayText() { return "Writing Heatmap"; }
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
		topBar.createDiv({ text: "Writing Heatmap", cls: "wg-sb-title" });
		const expandBtn = topBar.createEl("button", { cls: "wg-sb-expand-btn" });
		setIcon(expandBtn, "maximize-2");
		expandBtn.setAttribute("aria-label", "Open Detailed Stats");
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
		progressBar.setAttribute("aria-label", "Today's Writing Progress");
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
			monthlyWrap.createEl("h4", { text: "Monthly Breakdown", cls: "wg-dt-monthly-title" });

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
			.setDesc("Post Endpoint for the Daily Goal Notification")
			.addText((t) => t
				.setPlaceholder("https://hook.example.com/...")
				.setValue(this.plugin.settings.webhookUrl)
				.onChange((v) => {
					void this.persistWebhookUrl(v).catch((err) => console.error("Failed to save webhook URL:", err));
				})
			);

		new Setting(containerEl)
			.setName("Test Webhook")
			.setDesc("Send a Test Payload to Confirm Your Webhook Setup")
			.addButton((button) => button
				.setButtonText("Send Test Webhook")
				.onClick(() => {
					void this.runTestWebhook(button).catch((err) => console.error("Failed to send test webhook:", err));
				})
			);

		new Setting(containerEl)
			.setName("Daily Word Goal")
			.setDesc("New Words Needed to Trigger the Webhook")
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
			.setName("Heatmap Colour")
			.setDesc("Choose a Colour for the Heatmap");

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
			.setName("Goal-Met Visual Cue")
			.setDesc("Show the Small Marker on Days Where the Daily Word Goal Was Met")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showGoalMetCue)
				.onChange((value) => {
					void this.persistGoalMetCue(value).catch((err) => console.error("Failed to save goal-met cue setting:", err));
				})
			);
	}
}
