"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const editor_cache_1 = require("../src/editor-cache");
(0, node_test_1.default)("reusing an editor for a new path clears the stale reverse mapping", () => {
    const editorA = { id: "a" };
    const editorB = { id: "b" };
    const filePathByEditor = new Map();
    const editorByFilePath = new Map();
    (0, editor_cache_1.setTrackedEditorPath)(filePathByEditor, editorByFilePath, editorA, "old.md");
    (0, editor_cache_1.setTrackedEditorPath)(filePathByEditor, editorByFilePath, editorB, "other.md");
    (0, editor_cache_1.setTrackedEditorPath)(filePathByEditor, editorByFilePath, editorA, "new.md");
    strict_1.default.equal(filePathByEditor.get(editorA), "new.md");
    strict_1.default.equal(editorByFilePath.get("old.md"), undefined);
    strict_1.default.equal(editorByFilePath.get("new.md"), editorA);
    strict_1.default.equal(editorByFilePath.get("other.md"), editorB);
});
(0, node_test_1.default)("findTrackedValueByPath returns the currently opened file match", () => {
    const first = { id: "first", file: { path: "old.md" } };
    const second = { id: "second", file: { path: "today.md" } };
    strict_1.default.equal((0, editor_cache_1.findTrackedValueByPath)([first, second], "today.md"), second);
    strict_1.default.equal((0, editor_cache_1.findTrackedValueByPath)([first, second], "missing.md"), null);
});
