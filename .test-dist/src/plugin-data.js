"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginDataStore = void 0;
exports.normalizePluginData = normalizePluginData;
exports.mergePluginData = mergePluginData;
const daily_progress_1 = require("./daily-progress");
const DEBUG_PLUGIN_DATA_DIAGNOSTICS = false;
function logPluginDataDiagnostic(event, details) {
    if (!DEBUG_PLUGIN_DATA_DIAGNOSTICS)
        return;
    console.debug(`[word-goal][plugin-data] ${event}`, details);
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeHistoryEntry(record, dailyGoal) {
    if (!record || typeof record.totalWords !== "number" || !Number.isFinite(record.totalWords))
        return undefined;
    const totalWords = Math.max(0, Math.floor(record.totalWords));
    return {
        totalWords,
        goalMet: record.goalMet === true || totalWords >= dailyGoal,
        updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
    };
}
function compareHistory(local, incoming) {
    if (!local)
        return incoming ? { ...incoming } : undefined;
    if (!incoming)
        return { ...local };
    const localUpdated = local.updatedAt ?? 0;
    const incomingUpdated = incoming.updatedAt ?? 0;
    if (incomingUpdated > localUpdated)
        return { ...incoming };
    if (localUpdated > incomingUpdated)
        return { ...local };
    return incoming.totalWords > local.totalWords ? { ...incoming } : { ...local };
}
function migrateLegacyActiveDay(loaded, today) {
    if (loaded?.activeDay) {
        return (0, daily_progress_1.normalizeActiveDay)(today, loaded.activeDay);
    }
    const legacyDate = typeof loaded?.todaysDate === "string" ? loaded.todaysDate : "";
    if (legacyDate.length === 0)
        return (0, daily_progress_1.createEmptyActiveDay)(today);
    const activeDay = (0, daily_progress_1.createEmptyActiveDay)(legacyDate);
    for (const [path, snapshot] of Object.entries(loaded?.todaysWordCount ?? {})) {
        if (!snapshot || typeof snapshot !== "object")
            continue;
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
    return legacyDate === today ? activeDay : (0, daily_progress_1.createEmptyActiveDay)(today);
}
function normalizePluginData(loaded, defaultSettings, today, version) {
    const settings = Object.assign({}, defaultSettings, isPlainObject(loaded?.settings) ? loaded?.settings : {});
    const history = {};
    for (const [dateKey, record] of Object.entries(loaded?.history ?? {})) {
        const normalized = normalizeHistoryEntry(record, settings.dailyGoal ?? 0);
        if (normalized)
            history[dateKey] = normalized;
    }
    return {
        version,
        settings,
        history,
        activeDay: migrateLegacyActiveDay(loaded, today),
        lastWebhookSentDate: typeof loaded?.lastWebhookSentDate === "string" ? loaded.lastWebhookSentDate : "",
    };
}
function mergePluginData(local, incoming, today) {
    const merged = {
        ...local,
        history: { ...local.history },
        activeDay: (0, daily_progress_1.mergeActiveDay)(local.activeDay, incoming.activeDay, today),
        lastWebhookSentDate: (incoming.lastWebhookSentDate ?? "") > (local.lastWebhookSentDate ?? "")
            ? incoming.lastWebhookSentDate
            : local.lastWebhookSentDate,
    };
    for (const dateKey of Object.keys(incoming.history)) {
        merged.history[dateKey] = compareHistory(local.history[dateKey], incoming.history[dateKey]) ?? merged.history[dateKey];
    }
    return merged;
}
class PluginDataStore {
    constructor(adapter, primaryPath, backupPaths, defaultSettings, version, getTodayKey) {
        this.adapter = adapter;
        this.primaryPath = primaryPath;
        this.backupPaths = backupPaths;
        this.defaultSettings = defaultSettings;
        this.version = version;
        this.getTodayKey = getTodayKey;
    }
    async readAndValidate(path) {
        try {
            if (!(await this.adapter.exists(path)))
                return null;
            const raw = await this.adapter.read(path);
            if (raw.trim().length === 0)
                return null;
            const parsed = JSON.parse(raw);
            return normalizePluginData(parsed, this.defaultSettings, this.getTodayKey(), this.version);
        }
        catch {
            return null;
        }
    }
    async restorePrimaryFromBackup(path) {
        const data = await this.readAndValidate(path);
        if (!data)
            return false;
        await this.adapter.write(this.primaryPath, JSON.stringify(data, null, 2));
        return true;
    }
    async loadBestAvailable() {
        for (const path of [this.primaryPath, ...this.backupPaths]) {
            const data = await this.readAndValidate(path);
            if (!data)
                continue;
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
    merge(local, incoming) {
        return mergePluginData(local, incoming, this.getTodayKey());
    }
    async rotateBackups() {
        for (let index = this.backupPaths.length - 1; index > 0; index--) {
            const from = this.backupPaths[index - 1];
            const to = this.backupPaths[index];
            if (await this.adapter.exists(to))
                await this.adapter.remove(to);
            if (await this.adapter.exists(from))
                await this.adapter.rename(from, to);
        }
        if (await this.adapter.exists(this.primaryPath)) {
            const firstBackup = this.backupPaths[0];
            if (await this.adapter.exists(firstBackup))
                await this.adapter.remove(firstBackup);
            await this.adapter.copy(this.primaryPath, firstBackup);
        }
    }
    async saveSafely(data) {
        await this.rotateBackups();
        const hasAnyBackup = (await Promise.all(this.backupPaths.map((path) => this.adapter.exists(path)))).some(Boolean);
        const primaryExists = await this.adapter.exists(this.primaryPath);
        if (!hasAnyBackup && primaryExists) {
            await this.adapter.copy(this.primaryPath, this.backupPaths[0]);
        }
        await this.adapter.write(this.primaryPath, JSON.stringify(data, null, 2));
    }
}
exports.PluginDataStore = PluginDataStore;
