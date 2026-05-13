import { Notice, requestUrl } from "obsidian";
import type { WordGoalSettings } from "./settings";

export interface WordGoalWebhookPayload {
	event: "daily_word_goal_reached";
	goal: number;
	actual: number;
	date: string;
	timestamp: string;
	test: boolean;
}

export interface SendWebhookOptions {
	settings: WordGoalSettings;
	actual: number;
	date: string;
	test: boolean;
}

export function buildWebhookPayload(options: SendWebhookOptions): WordGoalWebhookPayload {
	return {
		event: "daily_word_goal_reached",
		goal: options.settings.dailyGoal,
		actual: options.actual,
		date: options.date,
		timestamp: new Date().toISOString(),
		test: options.test,
	};
}

export async function sendWebhook(options: SendWebhookOptions): Promise<boolean> {
	const url = options.settings.webhookUrl.trim();
	if (!url) {
		new Notice(options.test ? "Word Goal: No Webhook URL Configured for Test." : "Word Goal: No Webhook URL Configured.");
		return false;
	}
	try {
		await requestUrl({
			url,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(buildWebhookPayload(options)),
		});
		new Notice(options.test ? "Word Goal: Test Webhook Sent ✓" : "Word Goal: Webhook Sent ✓");
		return true;
	} catch (err) {
		console.error("Word Goal webhook error:", err);
		new Notice(options.test ? "Word Goal: Test Webhook Failed." : "Word Goal: Webhook Failed.");
		return false;
	}
}
