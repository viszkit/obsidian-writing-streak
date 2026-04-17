"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const daily_progress_1 = require("../src/daily-progress");
const startup_progress_1 = require("../src/startup-progress");
(0, node_test_1.default)("fresh daily note keeps stored zero baseline when first live observation is stale and non-zero", () => {
    const result = (0, startup_progress_1.applyStoredBaselineSnapshot)({ date: "2026-04-15", files: {} }, "2026-04-15", "Journal/2026-04-15.md", 0, 10, 599);
    strict_1.default.equal(result.initialized, true);
    strict_1.default.equal(result.repaired, false);
    strict_1.default.equal(result.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
    strict_1.default.equal(result.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
    strict_1.default.equal(result.nextLastObservedWords, 599);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(result.activeDay), 0);
});
(0, node_test_1.default)("prefilled daily note keeps stored template words as the baseline", () => {
    const result = (0, startup_progress_1.applyStoredBaselineSnapshot)({ date: "2026-04-15", files: {} }, "2026-04-15", "Journal/template.md", 120, 10, 599);
    strict_1.default.equal(result.activeDay.files["Journal/template.md"].baselineWords, 120);
    strict_1.default.equal(result.activeDay.files["Journal/template.md"].latestWords, 120);
    strict_1.default.equal(result.nextLastObservedWords, 599);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(result.activeDay), 0);
});
(0, node_test_1.default)("startup snapshot auto-repairs a stale baseline already written for today", () => {
    const result = (0, startup_progress_1.applyStoredBaselineSnapshot)({
        date: "2026-04-15",
        files: {
            "Journal/2026-04-15.md": {
                baselineWords: 599,
                latestWords: 599,
                latestObservedAt: 5,
            },
        },
    }, "2026-04-15", "Journal/2026-04-15.md", 0, 10);
    strict_1.default.equal(result.initialized, false);
    strict_1.default.equal(result.repaired, true);
    strict_1.default.equal(result.activeDay.files["Journal/2026-04-15.md"].baselineWords, 0);
    strict_1.default.equal(result.activeDay.files["Journal/2026-04-15.md"].latestWords, 0);
    strict_1.default.equal(result.nextLastObservedWords, 599);
    strict_1.default.equal((0, daily_progress_1.getTodayTotal)(result.activeDay), 0);
});
