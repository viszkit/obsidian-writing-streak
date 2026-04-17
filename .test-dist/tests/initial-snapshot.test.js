"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const initial_snapshot_1 = require("../src/initial-snapshot");
const daily_progress_1 = require("../src/daily-progress");
(0, node_test_1.default)("first open falls back to stored words when editor is still empty", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(0, 2000), 2000);
});
(0, node_test_1.default)("empty files keep a zero baseline on first open", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(0, 0), 0);
});
(0, node_test_1.default)("stale non-zero editor words do not override an empty stored file", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(481, 0), 0);
});
(0, node_test_1.default)("stored file words win over stale editor words for existing notes", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(481, 2000), 2000);
});
(0, node_test_1.default)("fresh day keeps zero baseline after open before later writing", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-12");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-12", "today.md", (0, initial_snapshot_1.resolveInitialSnapshotWords)(481, 0), 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-12", "today.md", 481, 2);
    strict_1.default.equal(activeDay.files["today.md"].baselineWords, 0);
    strict_1.default.equal(activeDay.files["today.md"].latestWords, 481);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 481);
});
(0, node_test_1.default)("later editor-driven updates still grow from the stored baseline", () => {
    let activeDay = (0, daily_progress_1.createEmptyActiveDay)("2026-04-12");
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-12", "existing.md", (0, initial_snapshot_1.resolveInitialSnapshotWords)(481, 2000), 1);
    activeDay = (0, daily_progress_1.updateFileProgress)(activeDay, "2026-04-12", "existing.md", 2125, 2);
    strict_1.default.equal(activeDay.files["existing.md"].baselineWords, 2000);
    strict_1.default.equal(activeDay.files["existing.md"].latestWords, 2125);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(activeDay), 125);
});
