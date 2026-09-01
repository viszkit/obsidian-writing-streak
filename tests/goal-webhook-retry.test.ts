import test from "node:test";
import assert from "node:assert/strict";
import {
	GOAL_WEBHOOK_RETRY_DELAY_MS,
	GoalWebhookRetryQueue,
	type GoalWebhookDeliveryResult,
	type GoalWebhookRetryTimers,
	type PendingGoalWebhook,
} from "../src/goal-webhook-retry";

class FakeTimers implements GoalWebhookRetryTimers {
	private nextId = 1;
	readonly delays: number[] = [];
	readonly cleared: number[] = [];
	private readonly callbacks = new Map<number, () => void>();

	setTimeout(callback: () => void, delay: number): number {
		const id = this.nextId++;
		this.delays.push(delay);
		this.callbacks.set(id, callback);
		return id;
	}

	clearTimeout(timerId: number): void {
		this.cleared.push(timerId);
		this.callbacks.delete(timerId);
	}

	runNext(): void {
		const next = this.callbacks.entries().next().value as [number, () => void] | undefined;
		if (!next) return;
		const [id, callback] = next;
		this.callbacks.delete(id);
		callback();
	}
}

async function settle(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function createQueue(results: GoalWebhookDeliveryResult[]) {
	const timers = new FakeTimers();
	const deliveries: PendingGoalWebhook[] = [];
	const queue = new GoalWebhookRetryQueue({
		timers,
		deliver: async (event) => {
			deliveries.push(event);
			return results.shift() ?? "retry";
		},
	});
	return { queue, timers, deliveries };
}

test("failed deliveries retry once after five minutes and ignore duplicate queue requests", async () => {
	const { queue, timers, deliveries } = createQueue(["retry", "sent"]);
	const event = { date: "2026-05-18", actual: 500 };

	assert.equal(queue.queue(event), true);
	assert.equal(queue.queue(event), false);
	await settle();
	assert.deepEqual(deliveries, [event]);
	assert.deepEqual(timers.delays, [GOAL_WEBHOOK_RETRY_DELAY_MS]);

	timers.runNext();
	await settle();
	assert.deepEqual(deliveries, [event, event]);
	assert.equal(queue.hasPending(event.date), false);
	assert.deepEqual(timers.delays, [GOAL_WEBHOOK_RETRY_DELAY_MS]);
});

test("repeated failures keep the five-minute retry cadence", async () => {
	const { queue, timers, deliveries } = createQueue(["retry", "retry"]);
	const event = { date: "2026-05-18", actual: 500 };

	queue.queue(event);
	await settle();
	timers.runNext();
	await settle();

	assert.deepEqual(deliveries, [event, event]);
	assert.deepEqual(timers.delays, [GOAL_WEBHOOK_RETRY_DELAY_MS, GOAL_WEBHOOK_RETRY_DELAY_MS]);
	assert.equal(queue.hasPending(event.date), true);
});

test("retries retain the original goal event after midnight", async () => {
	const { queue, timers, deliveries } = createQueue(["retry", "sent"]);
	const event = { date: "2026-05-18", actual: 721 };

	queue.queue(event);
	await settle();
	timers.runNext();
	await settle();

	assert.deepEqual(deliveries, [event, event]);
});

test("discarded deliveries do not remain pending or schedule a retry", async () => {
	const { queue, timers } = createQueue(["discarded"]);
	const event = { date: "2026-05-18", actual: 500 };

	queue.queue(event);
	await settle();

	assert.equal(queue.hasPending(event.date), false);
	assert.deepEqual(timers.delays, []);
});

test("disposing the queue cancels scheduled retries", async () => {
	const { queue, timers, deliveries } = createQueue(["retry"]);
	const event = { date: "2026-05-18", actual: 500 };

	queue.queue(event);
	await settle();
	queue.dispose();
	timers.runNext();
	await settle();

	assert.equal(timers.cleared.length, 1);
	assert.deepEqual(deliveries, [event]);
	assert.equal(queue.hasPending(event.date), false);
});
