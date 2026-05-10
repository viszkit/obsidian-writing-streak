import test from "node:test";
import assert from "node:assert/strict";
import { uniqueOpenMarkdownFilePaths } from "../src/startup-open-files";

test("startup snapshot initialization deduplicates open files by path", () => {
	const paths = uniqueOpenMarkdownFilePaths([
		{ path: "Journal/2026/05-Mai/2026-05-10-Sonntag.md" },
		{ path: "Journal/2026/05-Mai/2026-05-10-Sonntag.md" },
		{ path: "Inbox/Seminararbeit.md" },
	]);

	assert.deepEqual(paths, [
		"Journal/2026/05-Mai/2026-05-10-Sonntag.md",
		"Inbox/Seminararbeit.md",
	]);
});
