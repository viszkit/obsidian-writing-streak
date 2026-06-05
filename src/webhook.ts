import { Notice as ObsidianNotice, requestUrl as obsidianRequestUrl, type RequestUrlParam } from "obsidian";
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

interface WebhookDependencies {
	Notice: typeof ObsidianNotice;
	requestUrl: typeof obsidianRequestUrl;
}

function getWebhookDependencies(): WebhookDependencies {
	return {
		Notice: ObsidianNotice,
		requestUrl: obsidianRequestUrl,
	};
}

export function isWebhookConfigured(settings: WordGoalSettings): boolean {
	return settings.webhookUrl.trim().length > 0;
}

export function shouldMarkWebhookHandled(settings: WordGoalSettings, sent: boolean): boolean {
	return sent || !isWebhookConfigured(settings);
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

export async function sendWebhook(options: SendWebhookOptions, dependencies?: WebhookDependencies): Promise<boolean> {
	const url = options.settings.webhookUrl.trim();
	if (!url) {
		return false;
	}

	const { Notice, requestUrl } = dependencies ?? getWebhookDependencies();
	try {
		await requestUrl({
			url,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(buildWebhookPayload(options)),
		} satisfies RequestUrlParam);
		new Notice(options.test ? "Word Goal: Test Webhook Sent ✓" : "Word Goal: Webhook Sent ✓");
		return true;
	} catch (err) {
		console.error("Word Goal webhook error:", err);
		new Notice(options.test ? "Word Goal: Test Webhook Failed." : "Word Goal: Webhook Failed.");
		return false;
	}
}
