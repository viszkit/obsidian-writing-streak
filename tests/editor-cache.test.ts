import test from "node:test";
import assert from "node:assert/strict";
import { setTrackedEditorPath } from "../src/editor-cache";

test("reusing an editor for a new path clears the stale reverse mapping", () => {
	const editorA = { id: "a" };
	const editorB = { id: "b" };
	const filePathByEditor = new Map<object, string>();
	const editorByFilePath = new Map<string, object>();

	setTrackedEditorPath(filePathByEditor, editorByFilePath, editorA, "old.md");
	setTrackedEditorPath(filePathByEditor, editorByFilePath, editorB, "other.md");
	setTrackedEditorPath(filePathByEditor, editorByFilePath, editorA, "new.md");

	assert.equal(filePathByEditor.get(editorA), "new.md");
	assert.equal(editorByFilePath.get("old.md"), undefined);
	assert.equal(editorByFilePath.get("new.md"), editorA);
	assert.equal(editorByFilePath.get("other.md"), editorB);
});
