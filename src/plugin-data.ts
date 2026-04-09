import { createEmptyActiveDay, DailyRecord, mergeActiveDay, normalizeActiveDay, type ActiveDayData } from "./daily-progress";

export interface PluginDataShape<TSettings> {
	version?: number;
	settings: TSettings;
	history: Record<string, DailyRecord>;
	activeDay: ActiveDayData;
	lastWebhookSentDate: string;
}

interface LegacyFileSnapshot {
	initial?: number;
	peak?: number;
	current?: number;
}

interface LegacyShape<TSettings> {
	version?: number;
	settings?: Partial<TSettings>;
	history?: Record<string, DailyRecord>;
	todaysWordCount?: Record<string, LegacyFileSnapshot>;
	todaysDate?: string;
	lastWebhookSentDate?: string;
	activeDay?: Partial<ActiveDayData>;
}

type AdapterLike = {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, contents: string): Promise<void>;
	copy(path: string, destination: string): Promise<void>;
	rename(path: string, destination: string): Promise<void>;
	remove(path: string): Promise<void>;
	stat(path: string): Promise<{ mtime: number } | null>;
};

const DEBUG_PLUGIN_DATA_DIAGNOSTICS = false;

function logPluginDataDiagnostic(event: string, details: Record<string, unknown>) {
	if (!DEBUG_PLUGIN_DATA_DIAGNOSTICS) return;
	console.debug(`[word-goal][plugin-data] ${event}`, details);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHistoryEntry(record: DailyRecord | undefined, dailyGoal: number): DailyRecord | undefined {
	if (!record || typeof record.totalWords !== "number" || !Number.isFinite(record.totalWords)) return undefined;
	const totalWords = Math.max(0, Math.floor(record.totalWords));
	return {
		totalWords,
		goalMet: record.goalMet === true || totalWords >= dailyGoal,
		updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
	};
}

function compareHistory(local: DailyRecord | undefined, incoming: DailyRecord | undefined): DailyRecord | undefined {
	if (!local) return incoming ? { ...incoming } : undefined;
	if (!incoming) return { ...local };
	const localUpdated = local.updatedAt ?? 0;
	const incomingUpdated = incoming.updatedAt ?? 0;
	if (incomingUpdated > localUpdated) return { ...incoming };
	if (localUpdated > incomingUpdated) return { ...local };
	return incoming.totalWords > local.totalWords ? { ...incoming } : { ...local };
}

function migrateLegacyActiveDay<TSettings>(loaded: LegacyShape<TSettings> | null | undefined, today: string): ActiveDayData {
	if (loaded?.activeDay) {
		return normalizeActiveDay(today, loaded.activeDay);
	}
	const legacyDate = typeof loaded?.todaysDate === "string" ? loaded.todaysDate : "";
	if (legacyDate.length === 0) return createEmptyActiveDay(today);
	const activeDay = createEmptyActiveDay(legacyDate);
	for (const [path, snapshot] of Object.entries(loaded?.todaysWordCount ?? {})) {
		if (!snapshot || typeof snapshot !== "object") continue;
		const latestCandidate = typeof snapshot.current === "number" && Number.isFinite(snapshot.current)
			? snapshot.current
			: typeof snapshot.peak === "number" && Number.isFinite(snapshot.peak)
				? snapshot.peak
				: 0;
		const baselineWords = typeof snapshot.initial === "number" && Number.isFinite(snapshot.initial)
			? snapshot.initial
			: latestCandidate;
		activeDay.files[path] = {
			baselineWords,
			latestWords: Math.max(baselineWords, latestCandidate),
			latestObservedAt: 0,
		};
		logPluginDataDiagnostic("migrate-legacy-file-progress", {
			path,
			initial: snapshot.initial,
			peak: snapshot.peak,
			current: snapshot.current,
			baselineWords,
			latestWords: activeDay.files[path].latestWords,
		});
	}
	return legacyDate === today ? activeDay : createEmptyActiveDay(today);
}

export function normalizePluginData<TSettings>(
	loaded: LegacyShape<TSettings> | null | undefined,
	defaultSettings: TSettings,
	today: string,
	version: number
): PluginDataShape<TSettings> {
	const settings = Object.assign({}, defaultSettings, isPlainObject(loaded?.settings) ? loaded?.settings : {});
	const history: Record<string, DailyRecord> = {};
	for (const [dateKey, record] of Object.entries(loaded?.history ?? {})) {
		const normalized = normalizeHistoryEntry(record, (settings as { dailyGoal?: number }).dailyGoal ?? 0);
		if (normalized) history[dateKey] = normalized;
	}
	return {
		version,
		settings,
		history,
		activeDay: migrateLegacyActiveDay(loaded, today),
		lastWebhookSentDate: typeof loaded?.lastWebhookSentDate === "string" ? loaded.lastWebhookSentDate : "",
	};
}

export function mergePluginData<TSettings>(
	local: PluginDataShape<TSettings>,
	incoming: PluginDataShape<TSettings>,
	today: string
): PluginDataShape<TSettings> {
	const merged: PluginDataShape<TSettings> = {
		...local,
		history: { ...local.history },
		activeDay: mergeActiveDay(local.activeDay, incoming.activeDay, today),
		lastWebhookSentDate: (incoming.lastWebhookSentDate ?? "") > (local.lastWebhookSentDate ?? "")
			? incoming.lastWebhookSentDate
			: local.lastWebhookSentDate,
	};
	for (const dateKey of Object.keys(incoming.history)) {
		merged.history[dateKey] = compareHistory(local.history[dateKey], incoming.history[dateKey]) ?? merged.history[dateKey];
	}
	return merged;
}

export class PluginDataStore<TSettings> {
	constructor(
		private readonly adapter: AdapterLike,
		private readonly primaryPath: string,
		private readonly backupPaths: string[],
		private readonly defaultSettings: TSettings,
		private readonly version: number,
		private readonly getTodayKey: () => string
	) {}

	async readAndValidate(path: string): Promise<PluginDataShape<TSettings> | null> {
		try {
			if (!(await this.adapter.exists(path))) return null;
			const raw = await this.adapter.read(path);
			if (raw.trim().length === 0) return null;
			const parsed = JSON.parse(raw) as LegacyShape<TSettings>;
			return normalizePluginData(parsed, this.defaultSettings, this.getTodayKey(), this.version);
		} catch {
			return null;
		}
	}

	async restorePrimaryFromBackup(path: string): Promise<boolean> {
		const data = await this.readAndValidate(path);
		if (!data) return false;
		await this.adapter.write(this.primaryPath, JSON.stringify(data, null, 2));
		return true;
	}

	async loadBestAvailable(): Promise<{ data: PluginDataShape<TSettings>; sourcePath: string | null }> {
		for (const path of [this.primaryPath, ...this.backupPaths]) {
			const data = await this.readAndValidate(path);
			if (!data) continue;
			if (path !== this.primaryPath) {
				await this.restorePrimaryFromBackup(path);
			}
			return { data, sourcePath: path };
		}
		return {
			data: normalizePluginData(null, this.defaultSettings, this.getTodayKey(), this.version),
			sourcePath: null,
		};
	}

	merge(local: PluginDataShape<TSettings>, incoming: PluginDataShape<TSettings>): PluginDataShape<TSettings> {
		return mergePluginData(local, incoming, this.getTodayKey());
	}

	async rotateBackups(): Promise<void> {
		for (let index = this.backupPaths.length - 1; index > 0; index--) {
			const from = this.backupPaths[index - 1];
			const to = this.backupPaths[index];
			if (await this.adapter.exists(to)) await this.adapter.remove(to);
			if (await this.adapter.exists(from)) await this.adapter.rename(from, to);
		}
		if (await this.adapter.exists(this.primaryPath)) {
			const firstBackup = this.backupPaths[0];
			if (await this.adapter.exists(firstBackup)) await this.adapter.remove(firstBackup);
			await this.adapter.copy(this.primaryPath, firstBackup);
		}
	}

	async saveSafely(data: PluginDataShape<TSettings>): Promise<void> {
		await this.rotateBackups();
		const hasAnyBackup = (await Promise.all(this.backupPaths.map((path) => this.adapter.exists(path)))).some(Boolean);
		const primaryExists = await this.adapter.exists(this.primaryPath);
		if (!hasAnyBackup && primaryExists) {
			await this.adapter.copy(this.primaryPath, this.backupPaths[0]);
		}
		await this.adapter.write(this.primaryPath, JSON.stringify(data, null, 2));
	}
}
