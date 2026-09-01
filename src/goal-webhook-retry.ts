export const GOAL_WEBHOOK_RETRY_DELAY_MS = 5 * 60 * 1000;

export interface PendingGoalWebhook {
	date: string;
	actual: number;
}

export type GoalWebhookDeliveryResult = "sent" | "retry" | "discarded";

export interface GoalWebhookRetryTimers {
	setTimeout(callback: () => void, delay: number): number;
	clearTimeout(timerId: number): void;
}

interface GoalWebhookRetryQueueDependencies {
	deliver(event: PendingGoalWebhook): Promise<GoalWebhookDeliveryResult>;
	timers?: GoalWebhookRetryTimers;
	onUnexpectedError?(error: unknown): void;
}

function getDefaultTimers(): GoalWebhookRetryTimers {
	return {
		setTimeout: (callback, delay) => window.setTimeout(callback, delay),
		clearTimeout: (timerId) => window.clearTimeout(timerId),
	};
}

/** Keeps unsent automatic goal events alive for the current plugin session. */
export class GoalWebhookRetryQueue {
	private readonly pendingByDate = new Map<string, PendingGoalWebhook>();
	private readonly retryTimerByDate = new Map<string, number>();
	private readonly timers: GoalWebhookRetryTimers;

	constructor(private readonly dependencies: GoalWebhookRetryQueueDependencies) {
		this.timers = dependencies.timers ?? getDefaultTimers();
	}

	hasPending(date: string): boolean {
		return this.pendingByDate.has(date);
	}

	queue(event: PendingGoalWebhook): boolean {
		if (this.pendingByDate.has(event.date)) return false;
		this.pendingByDate.set(event.date, event);
		void this.attempt(event.date);
		return true;
	}

	dispose(): void {
		for (const timerId of this.retryTimerByDate.values()) {
			this.timers.clearTimeout(timerId);
		}
		this.retryTimerByDate.clear();
		this.pendingByDate.clear();
	}

	private async attempt(date: string): Promise<void> {
		const event = this.pendingByDate.get(date);
		if (!event) return;

		try {
			const result = await this.dependencies.deliver(event);
			if (this.pendingByDate.get(date) !== event) return;
			if (result === "sent" || result === "discarded") {
				this.pendingByDate.delete(date);
				this.clearRetryTimer(date);
				return;
			}
			this.scheduleRetry(date);
		} catch (error) {
			this.dependencies.onUnexpectedError?.(error);
			if (this.pendingByDate.get(date) === event) {
				this.scheduleRetry(date);
			}
		}
	}

	private scheduleRetry(date: string): void {
		if (this.retryTimerByDate.has(date)) return;
		const timerId = this.timers.setTimeout(() => {
			this.retryTimerByDate.delete(date);
			void this.attempt(date);
		}, GOAL_WEBHOOK_RETRY_DELAY_MS);
		this.retryTimerByDate.set(date, timerId);
	}

	private clearRetryTimer(date: string): void {
		const timerId = this.retryTimerByDate.get(date);
		if (timerId === undefined) return;
		this.timers.clearTimeout(timerId);
		this.retryTimerByDate.delete(date);
	}
}
