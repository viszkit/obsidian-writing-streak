export interface WordGoalSettings {
	webhookUrl: string;
	dailyGoal: number;
	heatmapColor: string;
	showGoalMetCue: boolean;
}

export const DEFAULT_SETTINGS: WordGoalSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
};

export const PLUGIN_DATA_VERSION = 2;

export const COLOR_PRESETS: { label: string; hex: string }[] = [
	{ label: "Green",  hex: "#39d353" },
	{ label: "Teal",   hex: "#4ce0b3" },
	{ label: "Blue",   hex: "#4a9eff" },
	{ label: "Purple", hex: "#a78bfa" },
	{ label: "Pink",   hex: "#f472b6" },
	{ label: "Orange", hex: "#fb923c" },
	{ label: "Yellow", hex: "#facc15" },
	{ label: "Red",    hex: "#f87171" },
];
