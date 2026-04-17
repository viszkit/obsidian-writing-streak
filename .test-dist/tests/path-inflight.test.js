"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const path_inflight_1 = require("../src/path-inflight");
(0, node_test_1.default)("concurrent initialization for the same path only runs the first task", async () => {
    const gate = new path_inflight_1.PathInFlightGate();
    let runs = 0;
    let releaseFirstRun = () => { };
    const firstRunPending = new Promise((resolve) => {
        releaseFirstRun = resolve;
    });
    const first = gate.run("today.md", async () => {
        runs++;
        await firstRunPending;
    });
    const second = gate.run("today.md", async () => {
        runs++;
    });
    await Promise.resolve();
    strict_1.default.equal(runs, 1);
    releaseFirstRun();
    strict_1.default.equal(await first, true);
    strict_1.default.equal(await second, false);
    strict_1.default.equal(runs, 1);
});
