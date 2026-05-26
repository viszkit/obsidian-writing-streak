import { App, TFile } from "obsidian";
import { buildDailyNotePathForDate as buildDailyNotePathForDateFromConfig, type DailyNotePathConfig } from "./daily-note-import";

export type { DailyNotePathConfig } from "./daily-note-import";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCoreDailyNotePathConfig(app: App): DailyNotePathConfig | null {
	const internalPlugins = (app as App & {
		internalPlugins?: {
			getPluginById?: (id: string) => unknown;
			plugins?: Record<string, unknown>;
		};
	}).internalPlugins;
	const plugin = internalPlugins?.getPluginById?.("daily-notes")
		?? internalPlugins?.plugins?.["daily-notes"];
	const instance = (plugin as { instance?: { options?: unknown }; options?: unknown } | undefined)?.instance;
	const options = (instance?.options
		?? (plugin as { options?: unknown } | undefined)?.options) as { format?: unknown; folder?: unknown } | undefined;

	if (typeof options?.format !== "string" || options.format.trim().length === 0) {
		return null;
	}

	return {
		format: options.format.trim(),
		folder: typeof options.folder === "string" ? options.folder.trim() : "",
	};
}

async function getPeriodicDailyNotePathConfig(app: App): Promise<DailyNotePathConfig | null> {
	const plugins = (app as App & {
		plugins?: {
			plugins?: Record<string, unknown>;
		};
	}).plugins;
	const plugin = plugins?.plugins?.["periodic-notes"] as
		| { settings?: { daily?: { format?: unknown; folder?: unknown } } }
		| undefined;
	const pluginDailySettings = plugin?.settings?.daily;

	if (typeof pluginDailySettings?.format === "string" && pluginDailySettings.format.trim().length > 0) {
		return {
			format: pluginDailySettings.format.trim(),
			folder: typeof pluginDailySettings.folder === "string" ? pluginDailySettings.folder.trim() : "",
		};
	}

	try {
		const path = `${app.vault.configDir}/plugins/periodic-notes/data.json`;
		const exists = await app.vault.adapter.exists(path);
		if (!exists) return null;

		const raw = await app.vault.adapter.read(path);
		const parsed: unknown = JSON.parse(raw);
		const daily = isRecord(parsed) && isRecord(parsed.daily) ? parsed.daily : null;
		if (typeof daily?.format !== "string" || daily.format.trim().length === 0) {
			return null;
		}

		return {
			format: daily.format.trim(),
			folder: typeof daily.folder === "string" ? daily.folder.trim() : "",
		};
	} catch (err) {
		console.error("Failed to read Periodic Notes settings:", err);
		return null;
	}
}

export const buildDailyNotePathForDate = buildDailyNotePathForDateFromConfig;

export async function resolveDailyNotePathConfig(app: App): Promise<DailyNotePathConfig | null> {
	const periodicConfig = await getPeriodicDailyNotePathConfig(app);
	if (periodicConfig) {
		return periodicConfig;
	}

	const coreConfig = getCoreDailyNotePathConfig(app);
	if (coreConfig) {
		return coreConfig;
	}

	return null;
}

export async function resolveDailyNotePathForDate(app: App, date: Date): Promise<string | null> {
	const config = await resolveDailyNotePathConfig(app);
	if (!config) return null;
	return buildDailyNotePathForDate(date, config);
}

export type OpenDailyNoteResult =
	| { opened: true; path: string }
	| { opened: false; reason: "missing-config" | "invalid-path"; path?: undefined }
	| { opened: false; reason: "missing-file"; path: string };

export async function openDailyNoteForDate(app: App, date: Date): Promise<OpenDailyNoteResult> {
	const path = await resolveDailyNotePathForDate(app, date);
	if (!path) {
		const config = await resolveDailyNotePathConfig(app);
		return { opened: false, reason: config ? "invalid-path" : "missing-config" };
	}

	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return { opened: false, reason: "missing-file", path };

	const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit)
		?? app.workspace.getLeaf(false);
	await leaf.openFile(file);
	app.workspace.setActiveLeaf(leaf, { focus: true });
	return { opened: true, path };
}
