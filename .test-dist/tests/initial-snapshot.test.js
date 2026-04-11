"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const initial_snapshot_1 = require("../src/initial-snapshot");
(0, node_test_1.default)("first open falls back to stored words when editor is still empty", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(0, 2000), 2000);
});
(0, node_test_1.default)("empty files keep a zero baseline on first open", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(0, 0), 0);
});
(0, node_test_1.default)("loaded editor content wins over stored words", () => {
    strict_1.default.equal((0, initial_snapshot_1.resolveInitialSnapshotWords)(1500, 2000), 1500);
});
