import { ItemView, WorkspaceLeaf, WorkspaceMobileDrawer, setIcon } from "obsidian";
import { LEVEL_ALPHA, hexToRgba } from "../color";
import { formatLocalizedDate, formatLocalizedNumber, isToday } from "../dates";
import type { WordGoalPluginApi } from "../plugin-api";
import {
	buildYearGrid,
	calcStreaks,
	getHeatmapCellState,
	getStreakCardState,
	isGoalMetDay,
	isWritingDay,
	yearMax,
} from "../stats";
import { DetailModal } from "./detail-modal";

export const VIEW_TYPE_HEATMAP = "word-goal-heatmap-view";

export class SidebarHeatmapView extends ItemView {
	private shouldScrollToToday = false;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: WordGoalPluginApi) {
		super(leaf);
	}

	getViewType() { return VIEW_TYPE_HEATMAP; }
	getDisplayText() { return "Writing heatmap"; }
	getIcon() { return "flame"; }

	onOpen(): Promise<void> {
		this.shouldScrollToToday = true;
		this.refresh();
		return Promise.resolve();
	}

	refresh() {
		const root = this.contentEl;
		const shouldScrollToToday = this.shouldScrollToToday;
		const previousRootScrollTop = shouldScrollToToday ? 0 : root.scrollTop;
		const previousGridScrollTop = shouldScrollToToday
			? 0
			: root.querySelector<HTMLElement>(".wg-sb-grid-container")?.scrollTop ?? 0;
		root.empty();
		root.addClass("wg-sidebar");

		const year = new Date().getFullYear();
		const history = this.plugin.data.history;
		const color = this.plugin.settings.heatmapColor;

		const topBar = root.createDiv({ cls: "wg-sb-topbar" });
		topBar.createDiv({ text: "Writing heatmap", cls: "wg-sb-title" });
		const expandBtn = topBar.createEl("button", { cls: "wg-sb-expand-btn" });
		setIcon(expandBtn, "maximize-2");
		expandBtn.setAttribute("aria-label", "Open detailed stats");
		expandBtn.addEventListener("click", () => new DetailModal(this.app, this.plugin).open());

		const todayWords = this.plugin.todaysTotal();
		const goal = this.plugin.settings.dailyGoal;
		const isOverGoal = todayWords > goal;
		const fillRatio = Math.min(todayWords / goal, 1);
		const goalRatio = isOverGoal ? goal / todayWords : 1;
		const todayEl = root.createDiv({ cls: "wg-sb-today" });
		todayEl.style.setProperty("--wg-progress-color", color);
		todayEl.style.setProperty("--wg-progress-color-soft", hexToRgba(color, 0.18));
		todayEl.style.setProperty("--wg-progress-color-glow", hexToRgba(color, 0.32));
		if (this.plugin.isGoalCelebrating()) {
			todayEl.addClass("wg-sb-today-celebrate");
		}
		todayEl.createSpan({ text: `${todayWords}`, cls: "wg-sb-today-num" });
		const goalEl = todayEl.createSpan({ text: ` / ${goal}`, cls: "wg-sb-today-goal" });
		if (isOverGoal) {
			goalEl.addClass("wg-sb-today-goal-overflow");
		}
		const progressBar = todayEl.createDiv({ cls: "wg-sb-progress" });
		if (isOverGoal) {
			progressBar.addClass("wg-sb-progress-overgoal");
		}
		progressBar.style.setProperty("--wg-progress-fill-ratio", String(fillRatio));
		progressBar.style.setProperty("--wg-progress-goal-ratio", String(goalRatio));
		progressBar.setAttribute("role", "progressbar");
		progressBar.setAttribute("aria-label", "Today's writing progress");
		progressBar.setAttribute("aria-valuemin", "0");
		progressBar.setAttribute("aria-valuemax", String(Math.max(todayWords, goal)));
		progressBar.setAttribute("aria-valuenow", String(todayWords));
		progressBar.setAttribute("aria-valuetext", `${formatLocalizedNumber(todayWords)} Words Written, ${formatLocalizedNumber(goal)} Word Goal`);
		const progressFill = progressBar.createDiv({ cls: "wg-sb-progress-fill" });
		progressFill.setAttribute("aria-hidden", "true");
		const progressDivider = progressBar.createDiv({ cls: "wg-sb-progress-divider" });
		progressDivider.setAttribute("aria-hidden", "true");

		const max = yearMax(history, year);
		const weeks = buildYearGrid(year);

		const gridContainer = root.createDiv({ cls: "wg-sb-grid-container" });
		const grid = gridContainer.createDiv({ cls: "wg-sb-grid" });

		for (let w = 0; w < weeks.length; w++) {
			const row = grid.createDiv({ cls: "wg-sb-row" });
			for (const slot of weeks[w]) {
				if (!slot.date) {
					row.createDiv({ cls: "wg-sb-cell wg-sb-blank" });
					continue;
				}
				const slotDate = slot.date;

				const { words, level, goalMet } = getHeatmapCellState(history, slotDate, max);
				const cell = row.createDiv({ cls: "wg-sb-cell" });

				if (level > 0) {
					cell.style.backgroundColor = hexToRgba(color, LEVEL_ALPHA[level]);
				} else {
					cell.addClass("wg-sb-cell-empty");
				}
				if (goalMet && this.plugin.settings.showGoalMetCue) cell.addClass("wg-cell-goal-met");
				if (isToday(slotDate)) {
					cell.addClass("wg-day-today");
					cell.style.setProperty("--wg-today-accent", color);
				}

				const dateStr = formatLocalizedDate(slotDate, { day: "numeric", month: "short" });
				cell.dataset.tooltip = `${dateStr}: ${words}`;
				cell.addClass("wg-tooltip");
				cell.addClass("wg-sb-cell-clickable");
				cell.tabIndex = 0;
				cell.setAttribute("role", "button");

				const openDailyNote = () => {
					void this.openDailyNoteFromSidebar(slotDate).catch((err) => {
						console.error("Failed to open daily note from sidebar:", err);
					});
				};
				cell.addEventListener("click", openDailyNote);
				cell.addEventListener("keydown", (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					openDailyNote();
				});
			}
		}

		if (shouldScrollToToday) {
			this.shouldScrollToToday = false;
			window.requestAnimationFrame(() => {
				const todayCell = gridContainer.querySelector<HTMLElement>(".wg-day-today");
				todayCell?.scrollIntoView({ block: "center", inline: "nearest" });
			});
		} else {
			window.requestAnimationFrame(() => {
				root.scrollTop = previousRootScrollTop;
				gridContainer.scrollTop = previousGridScrollTop;
			});
		}

		const streakSection = root.createDiv({ cls: "wg-sb-streak-section" });
		const writing = calcStreaks(history, isWritingDay);
		const goalMet = calcStreaks(history, isGoalMetDay);
		const streakRow = streakSection.createDiv({ cls: "wg-sb-streaks" });
		this.streakCard(streakRow, "✍", "Writing Streak", writing.current, writing.longest, color);
		this.streakCard(streakRow, "🎯", "Goal Streak", goalMet.current, goalMet.longest, color);
	}

	private async openDailyNoteFromSidebar(date: Date): Promise<void> {
		const opened = await this.plugin.openDailyNoteForDate(date);
		if (!opened || !(this.app as typeof this.app & { isMobile?: boolean }).isMobile) return;

		this.collapseMobileSidebar();
	}

	private collapseMobileSidebar(): void {
		if (this.leaf.parent instanceof WorkspaceMobileDrawer) {
			this.leaf.parent.collapse();
			return;
		}

		this.app.workspace.rightSplit.collapse();
	}

	private streakCard(parent: HTMLElement, icon: string, title: string, current: number, longest: number, color: string) {
		const state = getStreakCardState(current, longest);
		const card = parent.createDiv({ cls: "wg-sb-streak-card" });
		card.addClass(`wg-sb-streak-card-${state}`);
		card.style.setProperty("--wg-streak-accent", color);
		card.style.setProperty("--wg-streak-accent-soft", hexToRgba(color, 0.35));
		card.style.setProperty("--wg-streak-accent-strong", hexToRgba(color, 0.95));
		card.style.setProperty("--wg-streak-text-accent", state === "best-active" ? color : hexToRgba(color, 0.8));
		const header = card.createDiv({ cls: "wg-sb-streak-card-header" });
		header.createSpan({ text: icon, cls: "wg-sb-streak-card-icon" });
		header.createSpan({ text: title, cls: "wg-sb-streak-card-title" });
		card.createDiv({ text: `${current} Days`, cls: "wg-sb-streak-card-current" });
		card.createDiv({ text: `Best: ${longest} Days`, cls: "wg-sb-streak-card-best" });
	}
}
