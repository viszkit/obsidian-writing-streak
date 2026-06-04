import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExcludedFolders, shouldCountPath } from "../src/settings";

test("excluded folders are normalized for storage", () => {
	assert.deepEqual(
		normalizeExcludedFolders([" /Zettelkasten/Notes ", "Zettelkasten/Notes/", "", "Refs\\Zotero"]),
		["Zettelkasten/Notes/", "Refs/Zotero/"]
	);
});

test("exclude mode counts files outside listed folders", () => {
	assert.equal(shouldCountPath("Drafts/source.md", ["Zettelkasten/Notes/"], "exclude"), true);
	assert.equal(shouldCountPath("Zettelkasten/Notes/source.md", ["Zettelkasten/Notes/"], "exclude"), false);
	assert.equal(shouldCountPath("Zettelkasten/Notes/Nested/source.md", ["Zettelkasten/Notes/"], "exclude"), false);
});

test("include mode counts only files inside listed folders", () => {
	assert.equal(shouldCountPath("Zettelkasten/Notes/source.md", ["Zettelkasten/Notes/"], "include"), true);
	assert.equal(shouldCountPath("Zettelkasten/Notes/Nested/source.md", ["Zettelkasten/Notes/"], "include"), true);
	assert.equal(shouldCountPath("Drafts/source.md", ["Zettelkasten/Notes/"], "include"), false);
});

test("folder helper does not match sibling prefixes", () => {
	assert.equal(shouldCountPath("Zettelkasten/Notes-old/source.md", ["Zettelkasten/Notes/"], "include"), false);
	assert.equal(shouldCountPath("Zettelkasten/Note/source.md", ["Zettelkasten/Notes/"], "include"), false);
	assert.equal(shouldCountPath("Zettelkasten/Notes-old/source.md", ["Zettelkasten/Notes/"], "exclude"), true);
	assert.equal(shouldCountPath("Zettelkasten/Note/source.md", ["Zettelkasten/Notes/"], "exclude"), true);
});

test("include mode with an empty folder list counts nothing", () => {
	assert.equal(shouldCountPath("Drafts/source.md", [], "include"), false);
});
