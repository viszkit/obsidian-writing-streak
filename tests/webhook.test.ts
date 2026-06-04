import test from "node:test";
import assert from "node:assert/strict";
import { sendWebhook, shouldMarkWebhookHandled } from "../src/webhook";
import type { WordGoalSettings } from "../src/settings";

function settings(webhookUrl: string): WordGoalSettings {
	return {
		webhookUrl,
		dailyGoal: 500,
		heatmapColor: "#39d353",
		showGoalMetCue: true,
		folderFilterMode: "exclude",
		excludedFolders: [],
	};
}

function webhookOptions(webhookUrl: string) {
	return {
		settings: settings(webhookUrl),
		actual: 500,
		date: "2026-05-18",
		test: false,
	};
}

test("empty webhook URL is a quiet no-op", async () => {
	const notices: string[] = [];
	const requests: unknown[] = [];

	class TestNotice {
		constructor(message: string | DocumentFragment) {
			notices.push(String(message));
		}
	}

	const sent = await sendWebhook(webhookOptions("   "), {
		Notice: TestNotice as never,
		requestUrl: ((request: unknown) => {
			requests.push(request);
			return Promise.resolve({ status: 200 });
		}) as never,
	});

	assert.equal(sent, false);
	assert.deepEqual(notices, []);
	assert.deepEqual(requests, []);
});

test("missing webhook URL marks the goal webhook as handled for the day", () => {
	assert.equal(shouldMarkWebhookHandled(settings(""), false), true);
	assert.equal(shouldMarkWebhookHandled(settings("   "), false), true);
});

test("configured webhook failures are not treated as handled", () => {
	assert.equal(shouldMarkWebhookHandled(settings("https://hook.example.com"), false), false);
	assert.equal(shouldMarkWebhookHandled(settings("https://hook.example.com"), true), true);
});
