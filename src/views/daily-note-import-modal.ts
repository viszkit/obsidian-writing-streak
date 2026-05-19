import { Modal, Notice, Setting, type App } from "obsidian";
import { dateToKey, todayKey } from "../dates";
import { buildDailyNoteImportDateKeys } from "../daily-note-import";
import type { DailyNoteWordCountImportRange } from "../imports/daily-note-word-count-import";

function startOfCurrentYear(): string {
	const now = new Date();
	return dateToKey(new Date(now.getFullYear(), 0, 1));
}

function isValidRange(startDate: string, endDate: string): boolean {
	try {
		buildDailyNoteImportDateKeys(startDate, endDate);
		return true;
	} catch {
		return false;
	}
}

export class DailyNoteImportModal extends Modal {
	private startDate = startOfCurrentYear();
	private endDate = todayKey();
	private isImporting = false;

	constructor(app: App, private readonly onImport: (range: DailyNoteWordCountImportRange) => Promise<void>) {
		super(app);
	}

	onOpen() {
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		const form = contentEl.createEl("form");
		form.createEl("h2", { text: "Import daily note word counts" });

		new Setting(form)
			.setName("Start date")
			.setDesc("First daily note date to check")
			.addText((text) => {
				text.inputEl.type = "date";
				text
					.setValue(this.startDate)
					.onChange((value) => {
						this.startDate = value;
					});
			});

		new Setting(form)
			.setName("End date")
			.setDesc("Last daily note date to check")
			.addText((text) => {
				text.inputEl.type = "date";
				text
					.setValue(this.endDate)
					.onChange((value) => {
						this.endDate = value;
					});
			});

		const actions = form.createDiv({ cls: "modal-button-container" });
		const cancelButton = actions.createEl("button", { text: "Cancel", type: "button" });
		cancelButton.addEventListener("click", () => this.close());

		const importButton = actions.createEl("button", { text: "Import", type: "submit", cls: "mod-cta" });
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			void this.submit(importButton);
		});
	}

	private async submit(importButton?: HTMLButtonElement) {
		if (this.isImporting) return;

		if (!isValidRange(this.startDate, this.endDate)) {
			new Notice("Choose a valid daily note import date range.");
			return;
		}

		this.isImporting = true;
		if (importButton) {
			importButton.disabled = true;
			importButton.textContent = "Importing...";
		}

		try {
			await this.onImport({
				startDate: this.startDate,
				endDate: this.endDate,
			});
			this.close();
		} catch (err) {
			console.error("Failed to import daily notes:", err);
			new Notice("Daily note import failed.");
			this.isImporting = false;
			if (importButton) {
				importButton.disabled = false;
				importButton.textContent = "Import";
			}
		}
	}
}
