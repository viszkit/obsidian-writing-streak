export interface WordGoalSettings {
	webhookUrl: string;
	dailyGoal: number;
	heatmapColor: string;
	showGoalMetCue: boolean;
	excludedFolders: string[];
}

export const DEFAULT_SETTINGS: WordGoalSettings = {
	webhookUrl: "",
	dailyGoal: 500,
	heatmapColor: "#39d353",
	showGoalMetCue: true,
	excludedFolders: [],
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

export function normalizeExcludedFolder(path: string): string {
	const trimmed = path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/g, "");
	return trimmed.length > 0 ? `${trimmed}/` : "";
}

export function normalizeExcludedFolders(paths: readonly string[]): string[] {
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const path of paths) {
		const folder = normalizeExcludedFolder(path);
		if (!folder || seen.has(folder)) continue;
		seen.add(folder);
		normalized.push(folder);
	}
	return normalized;
}

export function isPathInExcludedFolder(path: string, excludedFolders: readonly string[]): boolean {
	const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
	return normalizeExcludedFolders(excludedFolders).some((folder) => normalizedPath.startsWith(folder));
}
