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
		contentEl.createEl("h2", { text: "Import daily note word counts" });

		new Setting(contentEl)
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

		new Setting(contentEl)
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

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText("Cancel")
				.onClick(() => this.close())
			)
			.addButton((button) => button
				.setCta()
				.setButtonText("Import")
				.onClick(() => {
					void this.submit().catch((err) => console.error("Failed to import daily notes:", err));
				})
			);
	}

	private async submit() {
		if (!isValidRange(this.startDate, this.endDate)) {
			new Notice("Choose a valid daily note import date range.");
			return;
		}

		await this.onImport({
			startDate: this.startDate,
			endDate: this.endDate,
		});
		this.close();
	}
}
