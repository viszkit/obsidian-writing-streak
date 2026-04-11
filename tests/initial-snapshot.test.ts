import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialSnapshotWords } from "../src/initial-snapshot";

test("first open falls back to stored words when editor is still empty", () => {
	assert.equal(resolveInitialSnapshotWords(0, 2000), 2000);
});

test("empty files keep a zero baseline on first open", () => {
	assert.equal(resolveInitialSnapshotWords(0, 0), 0);
});

test("loaded editor content wins over stored words", () => {
	assert.equal(resolveInitialSnapshotWords(1500, 2000), 1500);
});
