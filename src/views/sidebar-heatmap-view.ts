import { ItemView, Notice, WorkspaceLeaf, WorkspaceMobileDrawer, setIcon } from "obsidian";
import { LEVEL_ALPHA, hexToRgba } from "../color";
import { dateToKey, formatLocalizedDate, formatLocalizedNumber, isToday } from "../dates";
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

interface TodaySummaryElements {
	container: HTMLElement;
	count: HTMLElement;
	goal: HTMLElement;
	progress: HTMLElement;
}

interface StreakCardElements {
	card: HTMLElement;
	current: HTMLElement;
	best: HTMLElement;
}

export class SidebarHeatmapView extends ItemView {
	private shouldScrollToToday = false;
	private renderedYear: number | null = null;
	private renderedColor = "";
	private renderedShowGoalMetCue: boolean | null = null;
	private todaySummary: TodaySummaryElements | null = null;
	private gridContainer: HTMLElement | null = null;
	private heatmapCells = new Map<string, HTMLElement>();
	private writingStreakCard: StreakCardElements | null = null;
	private goalStreakCard: StreakCardElements | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: WordGoalPluginApi) {
		super(leaf);
	}

	getViewType(this: void) { return VIEW_TYPE_HEATMAP; }
	getDisplayText(this: void) { return "Writing heatmap"; }
	getIcon(this: void) { return "flame"; }

	onOpen(): Promise<void> {
		this.shouldScrollToToday = true;
		this.refresh();
		return Promise.resolve();
	}

	refresh() {
		const year = new Date().getFullYear();
		if (this.needsStructuralRender(year)) {
			this.renderStructure(year);
			return;
		}

		this.updateTodaySummary();
		this.updateHeatmapCells(year);
		this.updateStreakCards();
	}

	private needsStructuralRender(year: number): boolean {
		return (
			this.renderedYear !== year ||
			this.renderedColor !== this.plugin.settings.heatmapColor ||
			this.renderedShowGoalMetCue !== this.plugin.settings.showGoalMetCue ||
			!this.todaySummary ||
			!this.gridContainer ||
			this.heatmapCells.size === 0 ||
			!this.writingStreakCard ||
			!this.goalStreakCard
		);
	}

	private renderStructure(year: number) {
		const root = this.contentEl;
		const shouldScrollToToday = this.shouldScrollToToday;
		this.resetElementCache();
		root.empty();
		root.addClass("wg-sidebar");

		const history = this.plugin.data.history;
		const color = this.plugin.settings.heatmapColor;

		const topBar = root.createDiv({ cls: "wg-sb-topbar" });
		topBar.createDiv({ text: "Writing heatmap", cls: "wg-sb-title" });
		const expandBtn = topBar.createEl("button", { cls: "wg-sb-expand-btn" });
		setIcon(expandBtn, "maximize-2");
		expandBtn.setAttribute("aria-label", "Open detailed stats");
		expandBtn.addEventListener("click", () => new DetailModal(this.app, this.plugin).open());

		const todayEl = root.createDiv({ cls: "wg-sb-today" });
		const countEl = todayEl.createSpan({ cls: "wg-sb-today-num" });
		const goalEl = todayEl.createSpan({ cls: "wg-sb-today-goal" });
		const progressBar = todayEl.createDiv({ cls: "wg-sb-progress" });
		const progressFill = progressBar.createDiv({ cls: "wg-sb-progress-fill" });
		progressFill.setAttribute("aria-hidden", "true");
		const progressDivider = progressBar.createDiv({ cls: "wg-sb-progress-divider" });
		progressDivider.setAttribute("aria-hidden", "true");
		this.todaySummary = {
			container: todayEl,
			count: countEl,
			goal: goalEl,
			progress: progressBar,
		};
		this.updateTodaySummary();

		const max = yearMax(history, year);
		const gridContainer = root.createDiv({ cls: "wg-sb-grid-container" });
		this.gridContainer = gridContainer;
		const grid = gridContainer.createDiv({ cls: "wg-sb-grid" });

		for (const week of buildYearGrid(year)) {
			const row = grid.createDiv({ cls: "wg-sb-row" });
			for (const slot of week) {
				if (!slot.date) {
					row.createDiv({ cls: "wg-sb-cell wg-sb-blank" });
					continue;
				}

				const slotDate = slot.date;
				const { words, level, goalMet } = getHeatmapCellState(history, slotDate, max);
				const cell = row.createDiv({ cls: "wg-sb-cell" });
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

				this.heatmapCells.set(dateToKey(slotDate), cell);
				this.updateHeatmapCell(cell, slotDate, words, level, goalMet);
			}
		}

		const streakSection = root.createDiv({ cls: "wg-sb-streak-section" });
		const writing = calcStreaks(history, isWritingDay);
		const goalMet = calcStreaks(history, isGoalMetDay);
		const streakRow = streakSection.createDiv({ cls: "wg-sb-streaks" });
		this.writingStreakCard = this.streakCard(streakRow, "✍", "Writing Streak", writing.current, writing.longest, color);
		this.goalStreakCard = this.streakCard(streakRow, "🎯", "Goal Streak", goalMet.current, goalMet.longest, color);

		this.renderedYear = year;
		this.renderedColor = color;
		this.renderedShowGoalMetCue = this.plugin.settings.showGoalMetCue;

		if (shouldScrollToToday) {
			this.shouldScrollToToday = false;
			window.requestAnimationFrame(() => {
				const todayCell = gridContainer.querySelector<HTMLElement>(".wg-day-today");
				todayCell?.scrollIntoView({ block: "center", inline: "nearest" });
			});
		}
	}

	private resetElementCache() {
		this.todaySummary = null;
		this.gridContainer = null;
		this.heatmapCells.clear();
		this.writingStreakCard = null;
		this.goalStreakCard = null;
	}

	private updateTodaySummary() {
		if (!this.todaySummary) return;
		const todayWords = this.plugin.todaysTotal();
		const goal = this.plugin.settings.dailyGoal;
		const color = this.plugin.settings.heatmapColor;
		const isOverGoal = todayWords > goal;
		const fillRatio = Math.min(todayWords / goal, 1);
		const goalRatio = isOverGoal ? goal / todayWords : 1;
		const { container, count, goal: goalEl, progress } = this.todaySummary;

		container.setCssProps({
			"--wg-progress-color": color,
			"--wg-progress-color-soft": hexToRgba(color, 0.18),
			"--wg-progress-color-glow": hexToRgba(color, 0.32),
		});
		container.toggleClass("wg-sb-today-celebrate", this.plugin.isGoalCelebrating());
		count.textContent = `${todayWords}`;
		goalEl.textContent = ` / ${goal}`;
		goalEl.toggleClass("wg-sb-today-goal-overflow", isOverGoal);
		progress.toggleClass("wg-sb-progress-overgoal", isOverGoal);
		progress.setCssProps({
			"--wg-progress-fill-ratio": String(fillRatio),
			"--wg-progress-goal-ratio": String(goalRatio),
		});
		progress.setAttribute("role", "progressbar");
		progress.setAttribute("aria-label", "Today's writing progress");
		progress.setAttribute("aria-valuemin", "0");
		progress.setAttribute("aria-valuemax", String(Math.max(todayWords, goal)));
		progress.setAttribute("aria-valuenow", String(todayWords));
		progress.setAttribute("aria-valuetext", `${formatLocalizedNumber(todayWords)} Words Written, ${formatLocalizedNumber(goal)} Word Goal`);
	}

	private updateHeatmapCells(year: number) {
		const history = this.plugin.data.history;
		const max = yearMax(history, year);
		for (const week of buildYearGrid(year)) {
			for (const slot of week) {
				if (!slot.date) continue;
				const cell = this.heatmapCells.get(dateToKey(slot.date));
				if (!cell) continue;
				const { words, level, goalMet } = getHeatmapCellState(history, slot.date, max);
				this.updateHeatmapCell(cell, slot.date, words, level, goalMet);
			}
		}
	}

	private updateHeatmapCell(cell: HTMLElement, date: Date, words: number, level: number, goalMet: boolean) {
		const color = this.plugin.settings.heatmapColor;
		const dateKey = dateToKey(date);
		if (level > 0) {
			cell.setCssProps({ "--wg-cell-bg": hexToRgba(color, LEVEL_ALPHA[level]) });
			cell.removeClass("wg-sb-cell-empty");
		} else {
			cell.setCssProps({ "--wg-cell-bg": "var(--background-modifier-hover)" });
			cell.addClass("wg-sb-cell-empty");
		}
		cell.toggleClass("wg-cell-goal-met", goalMet && this.plugin.settings.showGoalMetCue);
		const today = isToday(date);
		cell.toggleClass("wg-day-today", today);
		if (today) {
			cell.setCssProps({ "--wg-today-accent": color });
		} else {
			cell.setCssProps({ "--wg-today-accent": "var(--interactive-accent, var(--text-accent))" });
		}
		const activeDailyNote = this.plugin.getActiveDailyNoteDateKey() === dateKey;
		cell.toggleClass("wg-day-active-note", activeDailyNote);
		if (activeDailyNote) {
			cell.setCssProps({ "--wg-active-note-accent": color });
		} else {
			cell.setCssProps({ "--wg-active-note-accent": "var(--interactive-accent)" });
		}

		const dateStr = formatLocalizedDate(date, { day: "numeric", month: "short" });
		cell.dataset.tooltip = `${dateStr}: ${words}`;
	}

	private updateStreakCards() {
		if (!this.writingStreakCard || !this.goalStreakCard) return;
		const history = this.plugin.data.history;
		const writing = calcStreaks(history, isWritingDay);
		const goalMet = calcStreaks(history, isGoalMetDay);
		this.updateStreakCard(this.writingStreakCard, writing.current, writing.longest);
		this.updateStreakCard(this.goalStreakCard, goalMet.current, goalMet.longest);
	}

	private async openDailyNoteFromSidebar(date: Date): Promise<void> {
		const result = await this.plugin.openDailyNoteForDate(date);
		if (!result.opened) {
			this.showDailyNoteOpenFailure(date, result);
			return;
		}
		if (!(this.app as typeof this.app & { isMobile?: boolean }).isMobile) return;

		this.collapseMobileSidebar();
	}

	private showDailyNoteOpenFailure(
		date: Date,
		result: Extract<Awaited<ReturnType<WordGoalPluginApi["openDailyNoteForDate"]>>, { opened: false }>
	): void {
		const dateStr = formatLocalizedDate(date, { day: "numeric", month: "short", year: "numeric" });
		if (result.reason === "missing-file") {
			new Notice(`No daily note found for ${dateStr}: ${result.path}`);
			return;
		}
		if (result.reason === "invalid-path") {
			new Notice(`Could not build a daily note path for ${dateStr}. Check your daily note format.`);
			return;
		}
		new Notice("Configure Daily Notes or Periodic Notes to open heatmap days.");
	}

	private collapseMobileSidebar(): void {
		if (this.leaf.parent instanceof WorkspaceMobileDrawer) {
			this.leaf.parent.collapse();
			return;
		}

		this.app.workspace.rightSplit.collapse();
	}

	private streakCard(parent: HTMLElement, icon: string, title: string, current: number, longest: number, color: string): StreakCardElements {
		const state = getStreakCardState(current, longest);
		const card = parent.createDiv({ cls: "wg-sb-streak-card" });
		card.addClass(`wg-sb-streak-card-${state}`);
		this.applyStreakCardColors(card, color, state);
		const header = card.createDiv({ cls: "wg-sb-streak-card-header" });
		header.createSpan({ text: icon, cls: "wg-sb-streak-card-icon" });
		header.createSpan({ text: title, cls: "wg-sb-streak-card-title" });
		const currentEl = card.createDiv({ text: `${current} Days`, cls: "wg-sb-streak-card-current" });
		const bestEl = card.createDiv({ text: `Best: ${longest} Days`, cls: "wg-sb-streak-card-best" });
		return { card, current: currentEl, best: bestEl };
	}

	private updateStreakCard(elements: StreakCardElements, current: number, longest: number) {
		const color = this.plugin.settings.heatmapColor;
		const state = getStreakCardState(current, longest);
		elements.card.removeClass("wg-sb-streak-card-idle", "wg-sb-streak-card-active", "wg-sb-streak-card-best-active");
		elements.card.addClass(`wg-sb-streak-card-${state}`);
		this.applyStreakCardColors(elements.card, color, state);
		elements.current.textContent = `${current} Days`;
		elements.best.textContent = `Best: ${longest} Days`;
	}

	private applyStreakCardColors(card: HTMLElement, color: string, state: ReturnType<typeof getStreakCardState>): void {
		card.setCssProps({
			"--wg-streak-accent": color,
			"--wg-streak-accent-soft": hexToRgba(color, 0.35),
			"--wg-streak-accent-strong": hexToRgba(color, 0.95),
			"--wg-streak-text-accent": state === "best-active" ? color : hexToRgba(color, 0.8),
		});
	}
}
