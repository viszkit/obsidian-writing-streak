import { App, Modal } from "obsidian";
import { LEVEL_ALPHA, getOverachieverColors, hexToRgba } from "../color";
import { formatLocalizedDate, formatLocalizedNumber, isToday } from "../dates";
import type { WordGoalPluginApi } from "../plugin-api";
import {
	MONTHS,
	buildYearGrid,
	getHeatmapCellState,
	getMonthlySums,
	yearStats,
} from "../stats";

export class DetailModal extends Modal {
	private displayYear: number;

	constructor(app: App, private readonly plugin: WordGoalPluginApi) {
		super(app);
		this.displayYear = new Date().getFullYear();
	}

	onOpen() {
		this.modalEl.addClass("wg-detail-modal");
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const history = this.plugin.data.history;
		const year = this.displayYear;
		const currentYear = new Date().getFullYear();
		const color = this.plugin.settings.heatmapColor;

		const nav = contentEl.createDiv({ cls: "wg-dt-nav" });
		const btnPrev = nav.createEl("button", { text: "←", cls: "wg-dt-nav-btn" });
		btnPrev.addEventListener("click", () => { this.displayYear--; this.render(); });
		nav.createSpan({ text: `${year}`, cls: "wg-dt-year" });
		const btnNext = nav.createEl("button", { text: "→", cls: "wg-dt-nav-btn" });
		btnNext.disabled = year >= currentYear;
		btnNext.addEventListener("click", () => {
			if (this.displayYear >= currentYear) return;
			this.displayYear++;
			this.render();
		});

		const stats = yearStats(history, year);
		const statsRow = contentEl.createDiv({ cls: "wg-dt-stats" });

		this.statCard(statsRow, formatLocalizedNumber(stats.total), "Total Words", color);
		this.statCard(statsRow, `${stats.days}`, "Days Written", color);
		this.statCard(statsRow, formatLocalizedNumber(stats.avg), "Daily Average", color);

		const dailyGoal = this.plugin.settings.dailyGoal;
		const weeks = buildYearGrid(year);

		const scrollWrap = contentEl.createDiv({ cls: "wg-dt-scroll-wrap" });
		const scrollInner = scrollWrap.createDiv({ cls: "wg-dt-scroll-inner" });
		const heatWrap = scrollInner.createDiv({ cls: "wg-dt-heatmap" });

		const dayLabels = heatWrap.createDiv({ cls: "wg-dt-daylabels" });
		for (const d of ["Mon", "", "Wed", "", "Fri", "", ""]) {
			dayLabels.createDiv({ cls: "wg-dt-daylabel", text: d });
		}

		const grid = heatWrap.createDiv({ cls: "wg-dt-grid" });
		for (let w = 0; w < weeks.length; w++) {
			const col = grid.createDiv({ cls: "wg-dt-col" });
			for (const slot of weeks[w]) {
				if (!slot.date) { col.createDiv({ cls: "wg-dt-cell wg-dt-blank" }); continue; }

				const { words, level, goalMet } = getHeatmapCellState(history, slot.date, dailyGoal);
				const cell = col.createDiv({ cls: "wg-dt-cell" });

				if (level > 0) {
					cell.setCssProps({
						"--wg-cell-bg": hexToRgba(color, LEVEL_ALPHA[Math.min(level, 4)]),
						...getOverachieverColors(color),
					});
				} else {
					cell.addClass("wg-dt-cell-zero");
				}
				if (level === 5) cell.addClass("wg-cell-overachiever");
				if (goalMet && this.plugin.settings.showGoalMetCue) cell.addClass("wg-cell-goal-met");
				if (isToday(slot.date)) {
					cell.addClass("wg-day-today");
					cell.setCssProps({ "--wg-today-accent": color });
				}

				const dateStr = formatLocalizedDate(slot.date, {
					weekday: "short", day: "numeric", month: "short", year: "numeric",
				});
				cell.dataset.tooltip = `${dateStr}: ${words} Words`;
				cell.addClass("wg-tooltip");
			}
		}

		const legend = contentEl.createDiv({ cls: "wg-dt-legend" });
		legend.createSpan({ text: "Less", cls: "wg-dt-legend-text" });
		for (let i = 0; i <= 5; i++) {
			const c = legend.createDiv({ cls: "wg-dt-cell wg-dt-legend-cell" });
			if (i > 0) {
				c.setCssProps({
					"--wg-cell-bg": hexToRgba(color, LEVEL_ALPHA[Math.min(i, 4)]),
					...getOverachieverColors(color),
				});
				if (i === 5) c.addClass("wg-cell-overachiever");
			}
			else c.addClass("wg-dt-cell-zero");
		}
		legend.createSpan({ text: "More", cls: "wg-dt-legend-text" });

		const sums = getMonthlySums(history, year);
		const maxMonth = Math.max(...sums, 1);
		const monthlyWrap = contentEl.createDiv({ cls: "wg-dt-monthly" });
		monthlyWrap.createEl("h4", { text: "Monthly breakdown", cls: "wg-dt-monthly-title" });

		const monthGrid = monthlyWrap.createDiv({ cls: "wg-dt-month-grid" });
		for (let i = 0; i < 12; i++) {
			const row = monthGrid.createDiv({ cls: "wg-dt-month-row" });
			row.createSpan({ text: MONTHS[i], cls: "wg-dt-month-name" });
			const barWrap = row.createDiv({ cls: "wg-dt-bar-wrap" });
			const bar = barWrap.createDiv({ cls: "wg-dt-bar" });
			bar.setCssProps({
				"--wg-dt-bar-width": `${(sums[i] / maxMonth) * 100}%`,
				"--wg-dt-bar-color": hexToRgba(color, 0.7),
			});
			row.createSpan({ text: formatLocalizedNumber(sums[i]), cls: "wg-dt-month-val" });
		}
	}

	private statCard(parent: HTMLElement, value: string, label: string, color: string) {
		const card = parent.createDiv({ cls: "wg-dt-stat" });
		const num = card.createDiv({ text: value, cls: "wg-dt-stat-num" });
		num.setCssProps({ "--wg-dt-stat-color": color });
		for (const line of label.split("\n")) {
			card.createDiv({ text: line, cls: "wg-dt-stat-label" });
		}
	}
}
