import test from "node:test";
import assert from "node:assert/strict";
import { isPathInExcludedFolder, normalizeExcludedFolders } from "../src/settings";

test("excluded folders are normalized for storage", () => {
	assert.deepEqual(
		normalizeExcludedFolders([" /Zettelkasten/Notes ", "Zettelkasten/Notes/", "", "Refs\\Zotero"]),
		["Zettelkasten/Notes/", "Refs/Zotero/"]
	);
});

test("excluded folder helper matches nested files", () => {
	assert.equal(isPathInExcludedFolder("Zettelkasten/Notes/source.md", ["Zettelkasten/Notes/"]), true);
	assert.equal(isPathInExcludedFolder("Zettelkasten/Notes/Nested/source.md", ["Zettelkasten/Notes/"]), true);
});

test("excluded folder helper does not match sibling prefixes", () => {
	assert.equal(isPathInExcludedFolder("Zettelkasten/Notes-old/source.md", ["Zettelkasten/Notes/"]), false);
	assert.equal(isPathInExcludedFolder("Zettelkasten/Note/source.md", ["Zettelkasten/Notes/"]), false);
});
