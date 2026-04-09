"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const daily_progress_1 = require("../src/daily-progress");
(0, node_test_1.default)("normalizeActiveDay falls back missing baseline to latest words", () => {
    const normalized = (0, daily_progress_1.normalizeActiveDay)("2026-04-04", {
        date: "2026-04-04",
        files: {
            "note.md": {
                latestWords: 2000,
                latestObservedAt: 1,
            },
        },
    });
    strict_1.default.equal(normalized.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(normalized.files["note.md"].latestWords, 2000);
});
(0, node_test_1.default)("normalizeActiveDay repairs invalid baseline using latest words", () => {
    const normalized = (0, daily_progress_1.normalizeActiveDay)("2026-04-04", {
        date: "2026-04-04",
        files: {
            "note.md": {
                baselineWords: Number.NaN,
                latestWords: 2000,
                latestObservedAt: 1,
            },
        },
    });
    strict_1.default.equal(normalized.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(normalized.files["note.md"].latestWords, 2000);
});
(0, node_test_1.default)("net change is floored at zero", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "note.md", 100, 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "note.md", 80, 2);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 0);
});
(0, node_test_1.default)("per-file totals are aggregated", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "a.md", 10, 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "a.md", 25, 2);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "b.md", 5, 3);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "b.md", 9, 4);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 19);
});
(0, node_test_1.default)("rename keeps progress without duplication", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 20, 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 30, 2);
    activeDay = (0, daily_progress_1.renameFileProgress)(activeDay, "old.md", "new.md");
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 10);
    strict_1.default.equal(activeDay.files["old.md"], undefined);
});
(0, node_test_1.default)("rename moves progress and a recreated old path starts fresh", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 20, 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 30, 2);
    activeDay = (0, daily_progress_1.renameFileProgress)(activeDay, "old.md", "new.md");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 50, 3);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "old.md", 70, 4);
    strict_1.default.equal(activeDay.files["new.md"].baselineWords, 20);
    strict_1.default.equal(activeDay.files["new.md"].latestWords, 30);
    strict_1.default.equal(activeDay.files["old.md"].baselineWords, 50);
    strict_1.default.equal(activeDay.files["old.md"].latestWords, 70);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 30);
});
(0, node_test_1.default)("active-day merge keeps earliest baseline and newest latest count", () => {
    let local = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    local = (0, daily_progress_1.updateFileProgress)(local, "2026-04-04", "note.md", 100, 10);
    local = (0, daily_progress_1.updateFileProgress)(local, "2026-04-04", "note.md", 120, 20);
    let incoming = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    incoming = (0, daily_progress_1.updateFileProgress)(incoming, "2026-04-04", "note.md", 90, 5);
    incoming = (0, daily_progress_1.updateFileProgress)(incoming, "2026-04-04", "note.md", 140, 30);
    const merged = (0, daily_progress_1.mergeActiveDay)(local, incoming, "2026-04-04");
    strict_1.default.equal(merged.files["note.md"].baselineWords, 90);
    strict_1.default.equal(merged.files["note.md"].latestWords, 140);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(merged), 50);
});
(0, node_test_1.default)("merge ignores partial zero baseline when latest matches a valid baseline snapshot", () => {
    const merged = (0, daily_progress_1.mergeActiveDay)({
        date: "2026-04-04",
        files: {
            "note.md": { baselineWords: 2000, latestWords: 2000, latestObservedAt: 10 },
        },
    }, {
        date: "2026-04-04",
        files: {
            "note.md": { baselineWords: 0, latestWords: 2000, latestObservedAt: 20 },
        },
    }, "2026-04-04");
    strict_1.default.equal(merged.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(merged.files["note.md"].latestWords, 2000);
});
(0, node_test_1.default)("merge ignores stale empty snapshot when a valid baseline exists", () => {
    const merged = (0, daily_progress_1.mergeActiveDay)({
        date: "2026-04-04",
        files: {
            "note.md": { baselineWords: 0, latestWords: 0, latestObservedAt: 10 },
        },
    }, {
        date: "2026-04-04",
        files: {
            "note.md": { baselineWords: 2000, latestWords: 2200, latestObservedAt: 20 },
        },
    }, "2026-04-04");
    strict_1.default.equal(merged.files["note.md"].baselineWords, 2000);
    strict_1.default.equal(merged.files["note.md"].latestWords, 2200);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(merged), 200);
});
(0, node_test_1.default)("first observation of a pre-filled file starts with zero net new words", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "prefilled.md", 2000, 1);
    strict_1.default.equal(activeDay.files["prefilled.md"].baselineWords, 2000);
    strict_1.default.equal(activeDay.files["prefilled.md"].latestWords, 2000);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 0);
});
(0, node_test_1.default)("empty file can still grow from zero to counted words", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-04");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "draft.md", 0, 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-04", "draft.md", 2000, 2);
    strict_1.default.equal(activeDay.files["draft.md"].baselineWords, 0);
    strict_1.default.equal(activeDay.files["draft.md"].latestWords, 2000);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 2000);
});
