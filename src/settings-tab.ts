import { App, ButtonComponent, PluginSettingTab, Setting } from "obsidian";
import { normalizeHexColor } from "./color";
import type { WordGoalPluginApi } from "./plugin-api";
import { COLOR_PRESETS } from "./settings";

export class WordGoalSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: WordGoalPluginApi) {
		super(app, plugin as never);
	}

	private async persistWebhookUrl(value: string) {
		this.plugin.settings.webhookUrl = value;
		this.plugin.markDirty({ refreshSidebar: false });
		await this.plugin.flushSave();
	}

	private async runTestWebhook(button: ButtonComponent) {
		button.setDisabled(true);
		try {
			await this.plugin.sendTestWebhook();
		} finally {
			button.setDisabled(false);
		}
	}

	private async persistDailyWordGoal(value: string) {
		const n = parseInt(value, 10);
		if (isNaN(n) || n <= 0) return;

		this.plugin.settings.dailyGoal = n;
		this.plugin.syncTodayHistory();
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	private async applyHeatmapColor(hex: string) {
		const normalized = normalizeHexColor(hex);
		if (!normalized) return;

		this.plugin.settings.heatmapColor = normalized;
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
		this.display();
	}

	private updateCustomColorInput(inputEl: HTMLInputElement, value: string) {
		const hasValue = value.trim().length > 0;
		inputEl.toggleClass("wg-custom-color-invalid", hasValue && normalizeHexColor(value) === null);
	}

	private async persistGoalMetCue(value: boolean) {
		this.plugin.settings.showGoalMetCue = value;
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Webhook").setHeading();

		new Setting(containerEl)
			.setName("Webhook URL")
			.setDesc("Post endpoint for the daily goal notification")
			.addText((t) => t
				.setPlaceholder("https://hook.example.com/...")
				.setValue(this.plugin.settings.webhookUrl)
				.onChange((v) => {
					void this.persistWebhookUrl(v).catch((err) => console.error("Failed to save webhook URL:", err));
				})
			);

		new Setting(containerEl)
			.setName("Test webhook")
			.setDesc("Send a test payload to confirm your webhook setup")
			.addButton((button) => button
				.setButtonText("Send test webhook")
				.onClick(() => {
					void this.runTestWebhook(button).catch((err) => console.error("Failed to send test webhook:", err));
				})
			);

		new Setting(containerEl)
			.setName("Daily word goal")
			.setDesc("New words needed to trigger the webhook")
			.addText((t) => t
				.setPlaceholder("500")
				.setValue(String(this.plugin.settings.dailyGoal))
				.onChange((v) => {
					void this.persistDailyWordGoal(v).catch((err) => console.error("Failed to save daily word goal:", err));
				})
			);

		new Setting(containerEl).setName("Heatmap").setHeading();

		const colorSetting = new Setting(containerEl)
			.setName("Heatmap colour")
			.setDesc("Choose a colour for the heatmap");

		const swatchContainer = colorSetting.controlEl.createDiv({ cls: "wg-color-swatches" });
		const currentColor = normalizeHexColor(this.plugin.settings.heatmapColor) ?? COLOR_PRESETS[0].hex;
		const presetColors = new Set(COLOR_PRESETS.map((preset) => preset.hex));
		const currentIsPreset = presetColors.has(currentColor);

		for (const preset of COLOR_PRESETS) {
			const swatch = swatchContainer.createDiv({ cls: "wg-color-swatch" });
			swatch.style.backgroundColor = preset.hex;
			swatch.setAttribute("aria-label", preset.label);

			if (currentColor === preset.hex) {
				swatch.addClass("wg-swatch-active");
			}

			swatch.addEventListener("click", () => {
				void this.applyHeatmapColor(preset.hex).catch((err) => console.error("Failed to save heatmap colour:", err));
			});
		}

		if (!currentIsPreset) {
			const customSwatch = swatchContainer.createDiv({ cls: "wg-color-swatch wg-swatch-active" });
			customSwatch.style.backgroundColor = currentColor;
			customSwatch.setAttribute("aria-label", `Custom ${currentColor}`);
			customSwatch.addEventListener("click", () => {
				void this.applyHeatmapColor(currentColor).catch((err) => console.error("Failed to save custom heatmap colour:", err));
			});
		}

		new Setting(containerEl)
			.setName("Custom hex colour")
			.setDesc("Enter a 6-digit hex colour")
			.addText((text) => {
				const initialValue = currentIsPreset ? "" : currentColor;
				text
					.setPlaceholder("#ff6b6b")
					.setValue(initialValue)
					.onChange((value) => {
						this.updateCustomColorInput(text.inputEl, value);

						const normalized = normalizeHexColor(value);
						if (!normalized) return;

						void this.applyHeatmapColor(normalized).catch((err) => console.error("Failed to save custom heatmap colour:", err));
					});
				this.updateCustomColorInput(text.inputEl, initialValue);
			});

		new Setting(containerEl)
			.setName("Goal-met visual cue")
			.setDesc("Show the small marker on days where the daily word goal was met")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showGoalMetCue)
				.onChange((value) => {
					void this.persistGoalMetCue(value).catch((err) => console.error("Failed to save goal-met cue setting:", err));
				})
			);
	}
}
