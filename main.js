"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => WordGoalWebhookPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_HEATMAP = "word-goal-heatmap-view";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var COLOR_PRESETS = [
  { label: "Green", hex: "#39d353" },
  { label: "Teal", hex: "#4ce0b3" },
  { label: "Blue", hex: "#4a9eff" },
  { label: "Purple", hex: "#a78bfa" },
  { label: "Pink", hex: "#f472b6" },
  { label: "Orange", hex: "#fb923c" },
  { label: "Yellow", hex: "#facc15" },
  { label: "Red", hex: "#f87171" }
];
var DEFAULT_SETTINGS = {
  webhookUrl: "",
  dailyGoal: 500,
  heatmapColor: "#39d353",
  showGoalMetCue: true
};
var DEFAULT_DATA = {
  settings: { ...DEFAULT_SETTINGS },
  history: {},
  todaysWordCount: {},
  todaysDate: "",
  lastWebhookSentDate: ""
};
function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayKey() {
  return dateToKey(/* @__PURE__ */ new Date());
}
function countWords(text) {
  return (text.match(/\S+/g) || []).length;
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function lerpColor(from, to, t) {
  const f = [parseInt(from.slice(1, 3), 16), parseInt(from.slice(3, 5), 16), parseInt(from.slice(5, 7), 16)];
  const tC = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)];
  const r = Math.round(f[0] + (tC[0] - f[0]) * t);
  const g = Math.round(f[1] + (tC[1] - f[1]) * t);
  const b = Math.round(f[2] + (tC[2] - f[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
var LEVEL_ALPHA = [0, 0.3, 0.5, 0.75, 1];
function intensityLevel(words, max) {
  if (words === 0)
    return 0;
  const ratio = words / max;
  if (ratio <= 0.25)
    return 1;
  if (ratio <= 0.5)
    return 2;
  if (ratio <= 0.75)
    return 3;
  return 4;
}
function historyKeysByPredicate(history, matches, year) {
  return Object.entries(history).filter(([key, rec]) => matches(rec) && (year === void 0 || key.startsWith(`${year}-`))).map(([key]) => key).sort();
}
function previousDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return dateToKey(date);
}
function calcCurrentStreakFromSet(keys, anchor) {
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
function calcLongestStreak(keys) {
  let longest = 0;
  let streak = 0;
  let prev = null;
  for (const key of keys) {
    if (prev && previousDayKey(key) === prev) {
      streak++;
    } else {
      streak = 1;
    }
    if (streak > longest)
      longest = streak;
    prev = key;
  }
  return longest;
}
function calcStreaksFromKeys(keys, year) {
  if (keys.length === 0)
    return { current: 0, longest: 0 };
  const keySet = new Set(keys);
  const anchor = year === void 0 || year === (/* @__PURE__ */ new Date()).getFullYear() ? /* @__PURE__ */ new Date() : new Date(year, 11, 31);
  return {
    current: calcCurrentStreakFromSet(keySet, anchor),
    longest: calcLongestStreak(keys)
  };
}
function calcStreaks(history, matches, year) {
  return calcStreaksFromKeys(historyKeysByPredicate(history, matches, year), year);
}
function isWritingDay(record) {
  return record.totalWords > 0;
}
function isGoalMetDay(record) {
  return record.goalMet === true;
}
function yearMax(history, year) {
  let max = 1;
  for (const [key, rec] of Object.entries(history)) {
    if (key.startsWith(`${year}-`) && rec.totalWords > max)
      max = rec.totalWords;
  }
  return max;
}
function yearStats(history, year) {
  let total = 0, days = 0;
  for (const [key, rec] of Object.entries(history)) {
    if (!key.startsWith(`${year}-`))
      continue;
    if (rec.totalWords > 0) {
      total += rec.totalWords;
      days++;
    }
  }
  return { total, days, avg: days > 0 ? Math.round(total / days) : 0 };
}
function getMonthlySums(history, year) {
  const sums = new Array(12).fill(0);
  for (const [key, rec] of Object.entries(history)) {
    if (!key.startsWith(`${year}-`))
      continue;
    sums[parseInt(key.slice(5, 7), 10) - 1] += rec.totalWords;
  }
  return sums;
}
function getHeatmapCellState(history, date, max) {
  const key = dateToKey(date);
  const record = history[key];
  const words = record?.totalWords ?? 0;
  return {
    words,
    level: intensityLevel(words, max),
    goalMet: record?.goalMet === true
  };
}
function buildYearGrid(year) {
  const jan1 = new Date(year, 0, 1);
  const startDow = (jan1.getDay() + 6) % 7;
  const dec31 = new Date(year, 11, 31);
  const totalDays = Math.floor((dec31.getTime() - jan1.getTime()) / 864e5) + 1;
  const totalSlots = startDow + totalDays;
  const totalWeeks = Math.ceil(totalSlots / 7);
  const weeks = [];
  for (let w = 0; w < totalWeeks; w++) {
    const week = [];
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
var WordGoalWebhookPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.statusBarEl = null;
  }
  get settings() {
    return this.data.settings;
  }
  async onload() {
    await this.loadPluginData();
    this.addSettingTab(new WordGoalSettingTab(this.app, this));
    this.handleDayRollover();
    this.registerView(VIEW_TYPE_HEATMAP, (leaf) => new SidebarHeatmapView(leaf, this));
    this.addCommand({ id: "open-writing-heatmap", name: "Open writing heatmap", callback: () => this.activateSidebar() });
    this.addCommand({ id: "open-writing-stats", name: "Open writing stats", callback: () => new DetailModal(this.app, this).open() });
    this.addCommand({ id: "show-daily-word-count", name: "Show today's word count", callback: () => new import_obsidian.Notice(`Today: ${this.todaysTotal()} / ${this.settings.dailyGoal} words`) });
    this.addCommand({
      id: "import-daily-stats",
      name: "Import history from Daily Stats plugin",
      callback: () => this.importDailyStats()
    });
    const debouncedPersist = (0, import_obsidian.debounce)(() => {
      this.syncTodayHistory();
      this.queueSave();
      this.refreshSidebar();
    }, 800, true);
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        this.trackEditorChange(editor);
        this.updateStatusBar();
        debouncedPersist();
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.initializeSnapshotFromLeaf(leaf);
        this.updateStatusBar();
      })
    );
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("wg-statusbar");
    this.registerInterval(window.setInterval(() => this.updateStatusBar(), 1e3));
    this.updateStatusBar();
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.syncTodayHistory();
        this.savePluginData();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.app.workspace.onLayoutReady(() => {
      this.initializeOpenViewSnapshots();
      this.activateSidebar();
    });
  }
  async onunload() {
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.finalizeToday();
    await this.savePluginData();
  }
  // ── Today's total — computed from persisted snapshots ─────────────────
  todaysTotal() {
    let sum = 0;
    for (const snap of Object.values(this.data.todaysWordCount)) {
      sum += Math.max(snap.current - snap.initial, 0);
    }
    return sum;
  }
  // ── Day rollover ─────────────────────────────────────────────────────
  handleDayRollover() {
    const today = todayKey();
    if (this.data.todaysDate && this.data.todaysDate !== today) {
      this.finalizeDay(this.data.todaysDate);
    }
    if (this.data.todaysDate !== today) {
      this.data.todaysDate = today;
      this.data.todaysWordCount = {};
    }
    this.syncTodayHistory();
  }
  finalizeDay(dateKey) {
    this.syncHistoryEntry(dateKey, this.todaysTotal());
  }
  finalizeToday() {
    if (this.data.todaysDate) {
      this.syncHistoryEntry(this.data.todaysDate, this.todaysTotal());
    }
  }
  syncTodayHistory() {
    this.syncHistoryEntry(todayKey(), this.todaysTotal());
  }
  syncHistoryEntry(dateKey, totalWords) {
    const existing = this.data.history[dateKey];
    if (totalWords > 0) {
      this.data.history[dateKey] = {
        totalWords,
        goalMet: existing?.goalMet === true || totalWords >= this.settings.dailyGoal
      };
      return;
    }
    if (existing?.totalWords && existing.totalWords > 0)
      return;
    delete this.data.history[dateKey];
  }
  resolveMarkdownViewForEditor(editor) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof import_obsidian.MarkdownView && view.editor === editor) {
        return view;
      }
    }
    return null;
  }
  ensureFileSnapshot(file, content) {
    if (this.data.todaysDate !== todayKey()) {
      this.handleDayRollover();
    }
    const path = file.path;
    if (!this.data.todaysWordCount[path]) {
      const words = countWords(content);
      this.data.todaysWordCount[path] = { initial: words, current: words };
    }
  }
  initializeSnapshotFromLeaf(leaf) {
    if (!leaf)
      return;
    const view = leaf.view;
    if (!(view instanceof import_obsidian.MarkdownView))
      return;
    const file = view.file;
    if (!file)
      return;
    this.ensureFileSnapshot(file, view.editor.getValue());
  }
  initializeOpenViewSnapshots() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      this.initializeSnapshotFromLeaf(leaf);
    }
  }
  // ── Word tracking (fast, synchronous, runs on every keystroke) ───────
  trackEditorChange(editor) {
    if (this.data.todaysDate !== todayKey()) {
      this.handleDayRollover();
    }
    const view = this.resolveMarkdownViewForEditor(editor);
    const file = view?.file;
    if (!file || !(file instanceof import_obsidian.TFile))
      return;
    const content = editor.getValue();
    const currentWords = countWords(content);
    this.ensureFileSnapshot(file, content);
    this.data.todaysWordCount[file.path].current = currentWords;
    if (this.data.lastWebhookSentDate !== this.data.todaysDate && this.todaysTotal() >= this.settings.dailyGoal) {
      new import_obsidian.Notice(`\u{1F389} You hit ${this.settings.dailyGoal} words today!`);
      this.fireWebhook();
    }
  }
  // ── Debounced save (avoid hammering disk on every keystroke) ──────────
  async queueSave() {
    await this.savePluginData();
  }
  // ── Import from Daily Stats plugin ───────────────────────────────────
  async importDailyStats() {
    try {
      const adapter = this.app.vault.adapter;
      const path = `${this.app.vault.configDir}/plugins/obsidian-daily-stats/data.json`;
      const exists = await adapter.exists(path);
      if (!exists) {
        new import_obsidian.Notice("Daily Stats data.json not found.");
        return;
      }
      const raw = await adapter.read(path);
      const dsData = JSON.parse(raw);
      const dayCounts = dsData?.dayCounts ?? {};
      let imported = 0;
      for (const [dsKey, words] of Object.entries(dayCounts)) {
        if (typeof words !== "number" || words <= 0)
          continue;
        const parts = dsKey.split("/");
        if (parts.length !== 3)
          continue;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) + 1;
        const day = parseInt(parts[2], 10);
        const isoKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (!this.data.history[isoKey] || this.data.history[isoKey].totalWords === 0) {
          this.data.history[isoKey] = {
            totalWords: words,
            goalMet: words >= this.settings.dailyGoal
          };
          imported++;
        }
      }
      await this.savePluginData();
      this.refreshSidebar();
      new import_obsidian.Notice(`Imported ${imported} days from Daily Stats.`);
    } catch (err) {
      console.error("Import error:", err);
      new import_obsidian.Notice("Import failed \u2014 check console.");
    }
  }
  // ── Status bar ────────────────────────────────────────────────────────
  updateStatusBar() {
    if (!this.statusBarEl)
      return;
    if (this.data.todaysDate !== todayKey())
      this.handleDayRollover();
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
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_HEATMAP, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
  refreshSidebar() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP)) {
      leaf.view.refresh();
    }
  }
  // ── Persistence ───────────────────────────────────────────────────────
  async loadPluginData() {
    const loaded = await this.loadData();
    this.data = Object.assign({}, DEFAULT_DATA, loaded);
    this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings);
    if (!this.data.history)
      this.data.history = {};
    if (!this.data.todaysWordCount)
      this.data.todaysWordCount = {};
    if (!this.data.todaysDate)
      this.data.todaysDate = "";
    if (!this.data.lastWebhookSentDate)
      this.data.lastWebhookSentDate = "";
    for (const record of Object.values(this.data.history)) {
      if (record.totalWords > 0 && record.goalMet === void 0) {
        record.goalMet = record.totalWords >= this.data.settings.dailyGoal;
      }
    }
  }
  async savePluginData() {
    await this.saveData(this.data);
  }
  // ── Webhook ───────────────────────────────────────────────────────────
  async fireWebhook() {
    const url = this.settings.webhookUrl.trim();
    if (!url) {
      new import_obsidian.Notice("Word Goal: no webhook URL configured.");
      return;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "daily_word_goal_reached",
          goal: this.settings.dailyGoal,
          actual: this.todaysTotal(),
          date: this.data.todaysDate,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.data.lastWebhookSentDate = this.data.todaysDate;
      await this.savePluginData();
      new import_obsidian.Notice("Word Goal: webhook sent \u2713");
    } catch (err) {
      console.error("Word Goal webhook error:", err);
      new import_obsidian.Notice("Word Goal: webhook failed \u2013 check console.");
    }
  }
};
var SidebarHeatmapView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_HEATMAP;
  }
  getDisplayText() {
    return "Writing Heatmap";
  }
  getIcon() {
    return "flame";
  }
  async onOpen() {
    this.refresh();
  }
  refresh() {
    const root = this.contentEl;
    root.empty();
    root.addClass("wg-sidebar");
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const history = this.plugin.data.history;
    const color = this.plugin.settings.heatmapColor;
    const topBar = root.createDiv({ cls: "wg-sb-topbar" });
    const expandBtn = topBar.createEl("button", { cls: "wg-sb-expand-btn" });
    (0, import_obsidian.setIcon)(expandBtn, "maximize-2");
    expandBtn.setAttribute("aria-label", "Open detailed stats");
    expandBtn.addEventListener("click", () => new DetailModal(this.app, this.plugin).open());
    const todayWords = this.plugin.todaysTotal();
    const todayEl = root.createDiv({ cls: "wg-sb-today" });
    todayEl.createSpan({ text: `${todayWords}`, cls: "wg-sb-today-num" });
    todayEl.createSpan({ text: ` / ${this.plugin.settings.dailyGoal}`, cls: "wg-sb-today-goal" });
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
        const { words, level, goalMet: goalMet2 } = getHeatmapCellState(history, slot.date, max);
        const cell = row.createDiv({ cls: "wg-sb-cell" });
        if (level > 0) {
          cell.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[level]);
        } else {
          cell.addClass("wg-sb-cell-empty");
        }
        if (goalMet2 && this.plugin.settings.showGoalMetCue)
          cell.addClass("wg-cell-goal-met");
        const dateStr = slot.date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
        cell.dataset.tooltip = `${dateStr}: ${words}`;
        cell.addClass("wg-tooltip");
      }
    }
    const streakSection = root.createDiv({ cls: "wg-sb-streak-section" });
    const writing = calcStreaks(history, isWritingDay);
    const goalMet = calcStreaks(history, isGoalMetDay);
    const streakRow = streakSection.createDiv({ cls: "wg-sb-streaks" });
    this.streakCard(streakRow, "\u270D", "Writing streak", writing.current, writing.longest);
    this.streakCard(streakRow, "\u{1F3AF}", "Goal met streak", goalMet.current, goalMet.longest);
  }
  streakCard(parent, icon, title, current, longest) {
    const card = parent.createDiv({ cls: "wg-sb-streak-card" });
    const header = card.createDiv({ cls: "wg-sb-streak-card-header" });
    header.createSpan({ text: icon, cls: "wg-sb-streak-card-icon" });
    header.createSpan({ text: title, cls: "wg-sb-streak-card-title" });
    card.createDiv({ text: `${current} days`, cls: "wg-sb-streak-card-current" });
    card.createDiv({ text: `Best: ${longest} days`, cls: "wg-sb-streak-card-best" });
  }
};
var DetailModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.displayYear = (/* @__PURE__ */ new Date()).getFullYear();
  }
  onOpen() {
    this.modalEl.addClass("wg-detail-modal");
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const history = this.plugin.data.history;
    const year = this.displayYear;
    const color = this.plugin.settings.heatmapColor;
    const nav = contentEl.createDiv({ cls: "wg-dt-nav" });
    const btnPrev = nav.createEl("button", { text: "\u2190", cls: "wg-dt-nav-btn" });
    btnPrev.addEventListener("click", () => {
      this.displayYear--;
      this.render();
    });
    nav.createSpan({ text: `${year}`, cls: "wg-dt-year" });
    const btnNext = nav.createEl("button", { text: "\u2192", cls: "wg-dt-nav-btn" });
    btnNext.addEventListener("click", () => {
      this.displayYear++;
      this.render();
    });
    const stats = yearStats(history, year);
    const statsRow = contentEl.createDiv({ cls: "wg-dt-stats" });
    this.statCard(statsRow, stats.total.toLocaleString("de-DE"), "total words", color);
    this.statCard(statsRow, `${stats.days}`, "days written", color);
    this.statCard(statsRow, stats.avg.toLocaleString("de-DE"), "daily average", color);
    const max = yearMax(history, year);
    const weeks = buildYearGrid(year);
    const scrollWrap = contentEl.createDiv({ cls: "wg-dt-scroll-wrap" });
    const scrollInner = scrollWrap.createDiv({ cls: "wg-dt-scroll-inner" });
    const heatWrap = scrollInner.createDiv({ cls: "wg-dt-heatmap" });
    const dayLabels = heatWrap.createDiv({ cls: "wg-dt-daylabels" });
    for (const d of ["Mon", "", "Wed", "", "Fri", "", ""]) {
      dayLabels.createDiv({ cls: "wg-dt-daylabel", text: d });
    }
    const grid = heatWrap.createDiv({ cls: "wg-dt-grid" });
    for (let w = 0; w < weeks.length; w++) {
      const col = grid.createDiv({ cls: "wg-dt-col" });
      for (const slot of weeks[w]) {
        if (!slot.date) {
          col.createDiv({ cls: "wg-dt-cell wg-dt-blank" });
          continue;
        }
        const { words, level, goalMet } = getHeatmapCellState(history, slot.date, max);
        const cell = col.createDiv({ cls: "wg-dt-cell" });
        if (level > 0) {
          cell.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[level]);
        } else {
          cell.addClass("wg-dt-cell-zero");
        }
        if (goalMet && this.plugin.settings.showGoalMetCue)
          cell.addClass("wg-cell-goal-met");
        const dateStr = slot.date.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric"
        });
        cell.dataset.tooltip = `${dateStr}: ${words} words`;
        cell.addClass("wg-tooltip");
      }
    }
    const legend = contentEl.createDiv({ cls: "wg-dt-legend" });
    legend.createSpan({ text: "Less", cls: "wg-dt-legend-text" });
    for (let i = 0; i <= 4; i++) {
      const c = legend.createDiv({ cls: "wg-dt-cell wg-dt-legend-cell" });
      if (i > 0)
        c.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[i]);
      else
        c.addClass("wg-dt-cell-zero");
    }
    legend.createSpan({ text: "More", cls: "wg-dt-legend-text" });
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
      bar.style.width = `${sums[i] / maxMonth * 100}%`;
      bar.style.backgroundColor = hexToRgba(color, 0.7);
      row.createSpan({ text: sums[i].toLocaleString("de-DE"), cls: "wg-dt-month-val" });
    }
  }
  statCard(parent, value, label, color) {
    const card = parent.createDiv({ cls: "wg-dt-stat" });
    const num = card.createDiv({ text: value, cls: "wg-dt-stat-num" });
    num.style.color = color;
    for (const line of label.split("\n")) {
      card.createDiv({ text: line, cls: "wg-dt-stat-label" });
    }
  }
};
var WordGoalSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Webhook" });
    new import_obsidian.Setting(containerEl).setName("Webhook URL").setDesc("POST endpoint for the daily goal notification").addText(
      (t) => t.setPlaceholder("https://hook.example.com/...").setValue(this.plugin.settings.webhookUrl).onChange(async (v) => {
        this.plugin.settings.webhookUrl = v;
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Daily word goal").setDesc("New words needed to trigger the webhook").addText(
      (t) => t.setPlaceholder("500").setValue(String(this.plugin.settings.dailyGoal)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) {
          this.plugin.settings.dailyGoal = n;
          await this.plugin.savePluginData();
        }
      })
    );
    containerEl.createEl("h2", { text: "Heatmap" });
    const colorSetting = new import_obsidian.Setting(containerEl).setName("Heatmap colour").setDesc("Choose a colour for the heatmap");
    const swatchContainer = colorSetting.controlEl.createDiv({ cls: "wg-color-swatches" });
    for (const preset of COLOR_PRESETS) {
      const swatch = swatchContainer.createDiv({ cls: "wg-color-swatch" });
      swatch.style.backgroundColor = preset.hex;
      swatch.setAttribute("aria-label", preset.label);
      if (this.plugin.settings.heatmapColor === preset.hex) {
        swatch.addClass("wg-swatch-active");
      }
      swatch.addEventListener("click", async () => {
        this.plugin.settings.heatmapColor = preset.hex;
        await this.plugin.savePluginData();
        this.plugin.refreshSidebar();
        this.display();
      });
    }
    new import_obsidian.Setting(containerEl).setName("Goal-met visual cue").setDesc("Show the small marker on days where the daily word goal was met").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showGoalMetCue).onChange(async (value) => {
        this.plugin.settings.showGoalMetCue = value;
        await this.plugin.savePluginData();
        this.plugin.refreshSidebar();
      })
    );
  }
};
