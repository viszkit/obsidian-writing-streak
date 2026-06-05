import { lerpColor } from "../color";
import type { WordGoalSettings } from "../settings";

export function renderStatusBar(
	statusBarEl: HTMLElement | null,
	total: number,
	settings: WordGoalSettings
) {
	if (!statusBarEl) return;

	const goal = settings.dailyGoal;
	const pct = Math.min(total / goal, 1);
	const dotColor = lerpColor("#555555", settings.heatmapColor, pct);

	statusBarEl.empty();
	const dot = statusBarEl.createSpan({ cls: "wg-sb-dot" });
	dot.setCssProps({ "--wg-status-dot-color": dotColor });
	statusBarEl.createSpan({ text: ` ${total} / ${goal}`, cls: "wg-sb-text" });
}
