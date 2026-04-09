"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const plugin_data_1 = require("../src/plugin-data");
const defaultSettings = {
    webhookUrl: "",
    dailyGoal: 500,
    heatmapColor: "#39d353",
    showGoalMetCue: true,
};
(0, node_test_1.default)("legacy todaysWordCount migrates into activeDay", () => {
    const data = (0, plugin_data_1.normalizePluginData)({
        history: { "2026-04-03": { totalWords: 123 } },
        todaysDate: "2026-04-04",
        todaysWordCount: {
            "note.md": { initial: 100, peak: 145, current: 130 },
        },
    }, defaultSettings, "2026-04-04", 2);
    strict_1.default.equal(data.activeDay.files["note.md"].baselineWords, 100);
    strict_1.default.equal(data.activeDay.files["note.md"].latestWords, 130);
    strict_1.default.equal(data.history["2026-04-03"].goalMet, false);
});
(0, node_test_1.default)("legacy migration uses current words as baseline when initial is missing", () => {
    const data = (0, plugin_data_1.normalizePluginData)({
        todaysDate: "2026-04-04",
        todaysWordCount: {
            "note.md": { current: 2000 },
        },
    }, defaultSettings, "2026-04-04", 2);
    strict_1.default.equal(data.activeDay.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(data.activeDay.files["note.md"].latestWords, 2000);
});
(0, node_test_1.default)("legacy migration uses peak words as baseline when initial and current are missing", () => {
    const data = (0, plugin_data_1.normalizePluginData)({
        todaysDate: "2026-04-04",
        todaysWordCount: {
            "note.md": { peak: 2000 },
        },
    }, defaultSettings, "2026-04-04", 2);
    strict_1.default.equal(data.activeDay.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(data.activeDay.files["note.md"].latestWords, 2000);
});
(0, node_test_1.default)("history merge prefers newer updated records", () => {
    const local = (0, plugin_data_1.normalizePluginData)({
        history: { "2026-04-03": { totalWords: 100, goalMet: false, updatedAt: 10 } },
    }, defaultSettings, "2026-04-04", 2);
    const incoming = (0, plugin_data_1.normalizePluginData)({
        history: { "2026-04-03": { totalWords: 110, goalMet: false, updatedAt: 20 } },
    }, defaultSettings, "2026-04-04", 2);
    const store = new plugin_data_1.PluginDataStore({
        exists: async () => false,
        read: async () => "",
        write: async () => { },
        copy: async () => { },
        rename: async () => { },
        remove: async () => { },
        stat: async () => null,
    }, "data.json", ["backup.json"], defaultSettings, 2, () => "2026-04-04");
    const merged = store.merge(local, incoming);
    strict_1.default.equal(merged.history["2026-04-03"].totalWords, 110);
});
(0, node_test_1.default)("history goalMet defaults from goal threshold", () => {
    const data = (0, plugin_data_1.normalizePluginData)({
        history: { "2026-04-03": { totalWords: 600 } },
    }, defaultSettings, "2026-04-04", 2);
    strict_1.default.equal(data.history["2026-04-03"].goalMet, true);
});
