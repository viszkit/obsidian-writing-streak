import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("plugin updates active daily note highlight from opened files", () => {
	const source = readFileSync("main.ts", "utf8");

	assert.match(source, /resolveDailyNotePathConfig/);
	assert.match(source, /dailyNotePathToDateKey/);
	assert.match(source, /private activeDailyNoteDateKey: string \| null = null/);
	assert.match(source, /private activeDailyNoteRequestId = 0/);
	assert.match(source, /getActiveDailyNoteDateKey\(\): string \| null/);
	assert.match(source, /private async updateActiveDailyNoteFromFile\(file: TFile\): Promise<void>/);
	assert.match(source, /this\.tracker\.handleFileOpen\(file\);[\s\S]*this\.updateStatusBar\(\);[\s\S]*this\.updateActiveDailyNoteFromFile\(file\)/);
	assert.match(source, /dailyNotePathToDateKey\(file\.path, config\)/);
	assert.match(source, /activeFile\?\.path !== file\.path/);
});

test("plugin refreshes sidebar only when active daily note highlight changes", () => {
	const source = readFileSync("main.ts", "utf8");
	const setterBody = source.match(/\n\tprivate setActiveDailyNoteDateKey\(dateKey: string \| null\): void \{(?<body>[\s\S]*?)\n\t\}/)?.groups?.body ?? "";

	assert.match(setterBody, /this\.activeDailyNoteDateKey === dateKey/);
	assert.match(setterBody, /this\.activeDailyNoteDateKey = dateKey/);
	assert.match(setterBody, /this\.refreshSidebar\(\)/);
});
