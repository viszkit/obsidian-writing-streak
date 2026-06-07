import { App, ButtonComponent, PluginSettingTab, Setting } from "obsidian";
import { normalizeHexColor } from "./color";
import type { WordGoalPluginApi } from "./plugin-api";
import { COLOR_PRESETS, normalizeExcludedFolders } from "./settings";

interface DeclarativeSettingDefinition {
	name: string;
	desc?: string;
	render: (setting: Setting) => void;
}

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
		this.refreshSettingsTab();
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

	private async persistFolderFilterMode(includeOnly: boolean) {
		this.plugin.settings.folderFilterMode = includeOnly ? "include" : "exclude";
		this.plugin.reconcileTrackedFileFilter();
		this.plugin.syncTodayHistory();
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	private async persistExcludedFolders(value: string) {
		this.plugin.settings.excludedFolders = normalizeExcludedFolders(value.split(/\r?\n/));
		this.plugin.reconcileTrackedFileFilter();
		this.plugin.syncTodayHistory();
		this.plugin.markDirty({ refreshSidebar: true });
		await this.plugin.flushSave();
		this.plugin.refreshUi();
	}

	private refreshSettingsTab(): void {
		(this as { update?: () => void }).update?.();
	}

	display(): void {
		this.containerEl.empty();
		for (const definition of this.getSettingDefinitions()) {
			const setting = new Setting(this.containerEl);
			definition.render(setting);
		}
	}

	getSettingDefinitions(): DeclarativeSettingDefinition[] {
		const currentColor = normalizeHexColor(this.plugin.settings.heatmapColor) ?? COLOR_PRESETS[0].hex;
		const presetColors = new Set(COLOR_PRESETS.map((preset) => preset.hex));
		const currentIsPreset = presetColors.has(currentColor);

		return [
			{
				name: "Webhook",
				render: (setting) => {
					setting.setName("Webhook").setHeading();
				},
			},
			{
				name: "Webhook URL",
				desc: "Post endpoint for the daily goal notification. Requests are sent only to the URL you enter.",
				render: (setting) => {
					setting
						.setName("Webhook URL")
						.setDesc("Post endpoint for the daily goal notification. Requests are sent only to the URL you enter.")
						.addText((text) => {
							text
								.setPlaceholder("Webhook endpoint")
								.setValue(this.plugin.settings.webhookUrl)
								.onChange((value) => {
									void this.persistWebhookUrl(value).catch((err) => console.error("Failed to save webhook URL:", err));
								});
						});
				},
			},
			{
				name: "Test webhook",
				desc: "Send one test payload to the configured webhook URL.",
				render: (setting) => {
					setting
						.setName("Test webhook")
						.setDesc("Send one test payload to the configured webhook URL.")
						.addButton((button) => {
							button
								.setButtonText("Send test webhook")
								.onClick(() => {
									void this.runTestWebhook(button).catch((err) => console.error("Failed to send test webhook:", err));
								});
						});
				},
			},
			{
				name: "Daily word goal",
				desc: "New words needed to trigger the webhook",
				render: (setting) => {
					setting
						.setName("Daily word goal")
						.setDesc("New words needed to trigger the webhook")
						.addText((text) => {
							text
								.setPlaceholder("Word target")
								.setValue(String(this.plugin.settings.dailyGoal))
								.onChange((value) => {
									void this.persistDailyWordGoal(value).catch((err) => console.error("Failed to save daily word goal:", err));
								});
						});
				},
			},
			{
				name: "Heatmap",
				render: (setting) => {
					setting.setName("Heatmap").setHeading();
				},
			},
			{
				name: "Heatmap colour",
				desc: "Choose a colour for the heatmap",
				render: (setting) => {
					setting.setName("Heatmap colour").setDesc("Choose a colour for the heatmap");

					const swatchContainer = setting.controlEl.createDiv({ cls: "wg-color-swatches" });
					for (const preset of COLOR_PRESETS) {
						const swatch = swatchContainer.createDiv({ cls: "wg-color-swatch" });
						swatch.setCssProps({ "--wg-swatch-color": preset.hex });
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
						customSwatch.setCssProps({ "--wg-swatch-color": currentColor });
						customSwatch.setAttribute("aria-label", `Custom ${currentColor}`);
						customSwatch.addEventListener("click", () => {
							void this.applyHeatmapColor(currentColor).catch((err) => console.error("Failed to save custom heatmap colour:", err));
						});
					}
				},
			},
			{
				name: "Custom hex colour",
				desc: "Enter a 6-digit hex colour",
				render: (setting) => {
					setting
						.setName("Custom hex colour")
						.setDesc("Enter a 6-digit hex colour")
						.addText((text) => {
							const initialValue = currentIsPreset ? "" : currentColor;
							text
								.setPlaceholder("Custom colour")
								.setValue(initialValue)
								.onChange((value) => {
									this.updateCustomColorInput(text.inputEl, value);

									const normalized = normalizeHexColor(value);
									if (!normalized) return;

									void this.applyHeatmapColor(normalized).catch((err) => console.error("Failed to save custom heatmap colour:", err));
								});
							this.updateCustomColorInput(text.inputEl, initialValue);
						});
				},
			},
			{
				name: "Goal-met visual cue",
				desc: "Show the small marker on days where the daily word goal was met",
				render: (setting) => {
					setting
						.setName("Goal-met visual cue")
						.setDesc("Show the small marker on days where the daily word goal was met")
						.addToggle((toggle) => {
							toggle
								.setValue(this.plugin.settings.showGoalMetCue)
								.onChange((value) => {
									void this.persistGoalMetCue(value).catch((err) => console.error("Failed to save goal-met cue setting:", err));
								});
						});
				},
			},
			{
				name: "Counting",
				render: (setting) => {
					setting.setName("Counting").setHeading();
				},
			},
			{
				name: "Only include listed folders",
				desc: "Off: listed folders do not count. On: only listed folders count.",
				render: (setting) => {
					setting
						.setName("Only include listed folders")
						.setDesc("Off: listed folders do not count. On: only listed folders count.")
						.addToggle((toggle) => {
							toggle
								.setValue(this.plugin.settings.folderFilterMode === "include")
								.onChange((value) => {
									void this.persistFolderFilterMode(value).catch((err) => console.error("Failed to save folder filter mode:", err));
								});
						});
				},
			},
			{
				name: "Folder list",
				desc: "One folder path per line. The filter mode controls whether these folders are excluded or exclusively included.",
				render: (setting) => {
					setting
						.setName("Folder list")
						.setDesc("One folder path per line. The filter mode controls whether these folders are excluded or exclusively included.")
						.addTextArea((text) => {
							text
								.setPlaceholder("Writing folder")
								.setValue(this.plugin.settings.excludedFolders.join("\n"))
								.onChange((value) => {
									void this.persistExcludedFolders(value).catch((err) => console.error("Failed to save folder list:", err));
								});
							text.inputEl.rows = 4;
						});
				},
			},
		];
	}
}
