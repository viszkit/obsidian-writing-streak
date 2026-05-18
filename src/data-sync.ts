import { PluginDataStore, type PluginDataShape } from "./plugin-data";

type AdapterLike = ConstructorParameters<typeof PluginDataStore>[0];

export interface PluginDataCoordinatorOptions<TSettings> {
	adapter: AdapterLike;
	primaryPath: string;
	defaultSettings: TSettings;
	version: number;
	getTodayKey(): string;
	getCurrentData?(): PluginDataShape<TSettings>;
	onDataMerged?(data: PluginDataShape<TSettings>): PluginDataShape<TSettings>;
	onPendingSidebarRefresh?(): void;
}

export interface PluginDataLoadResult<TSettings> {
	data: PluginDataShape<TSettings>;
	shouldOpenHeatmapOnFirstInstall: boolean;
}

export interface PluginDataReloadResult<TSettings> {
	data: PluginDataShape<TSettings>;
	changed: boolean;
}

export class PluginDataCoordinator<TSettings> {
	private readonly store: PluginDataStore<TSettings>;
	private pluginDataMtime: number | null = null;
	private saveTimer: number | null = null;
	private dirty = false;
	private pendingSidebarRefresh = false;
	private saveInFlight: Promise<PluginDataShape<TSettings>> | null = null;

	constructor(private readonly options: PluginDataCoordinatorOptions<TSettings>) {
		this.store = new PluginDataStore(
			options.adapter,
			options.primaryPath,
			options.defaultSettings,
			options.version,
			options.getTodayKey
		);
	}

	async load(): Promise<PluginDataLoadResult<TSettings>> {
		const { data, sourcePath } = await this.store.loadBestAvailable();
		const stat = await this.options.adapter.stat(this.options.primaryPath);
		const shouldOpenHeatmapOnFirstInstall = !stat && !sourcePath;
		if (stat) {
			this.pluginDataMtime = stat.mtime;
		} else if (sourcePath) {
			const sourceStat = await this.options.adapter.stat(sourcePath);
			this.pluginDataMtime = sourceStat?.mtime ?? null;
		} else {
			this.pluginDataMtime = null;
		}
		return { data, shouldOpenHeatmapOnFirstInstall };
	}

	markDirty(options?: { refreshSidebar?: boolean }) {
		this.dirty = true;
		if (options?.refreshSidebar) {
			this.pendingSidebarRefresh = true;
		}
	}

	scheduleFlush(flush: () => void) {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(flush, 800);
	}

	async flush(currentData: PluginDataShape<TSettings>): Promise<PluginDataShape<TSettings>> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}

		if (this.saveInFlight) {
			return this.saveInFlight;
		}
		if (!this.dirty) return currentData;

		this.saveInFlight = this.performSaveLoop(currentData);
		try {
			return await this.saveInFlight;
		} finally {
			this.saveInFlight = null;
		}
	}

	async reloadIfChanged(currentData: PluginDataShape<TSettings>): Promise<PluginDataReloadResult<TSettings>> {
		const stat = await this.options.adapter.stat(this.options.primaryPath);
		if (!stat) return { data: currentData, changed: false };
		if (this.pluginDataMtime !== null && stat.mtime <= this.pluginDataMtime) {
			return { data: currentData, changed: false };
		}

		const incoming = await this.store.readAndValidate(this.options.primaryPath);
		if (!incoming) return { data: currentData, changed: false };
		const data = this.store.merge(currentData, incoming);
		this.pluginDataMtime = stat.mtime;
		return { data, changed: true };
	}

	dispose() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
	}

	private async performSaveLoop(currentData: PluginDataShape<TSettings>): Promise<PluginDataShape<TSettings>> {
		let data = currentData;
		while (this.dirty) {
			this.dirty = false;
			data = await this.saveSafely(this.options.getCurrentData?.() ?? data);
		}
		if (this.pendingSidebarRefresh) {
			this.pendingSidebarRefresh = false;
			this.options.onPendingSidebarRefresh?.();
		}
		return data;
	}

	private async saveSafely(currentData: PluginDataShape<TSettings>): Promise<PluginDataShape<TSettings>> {
		let data = currentData;
		const diskData = await this.store.loadBestAvailable();
		if (diskData.sourcePath) {
			data = this.store.merge(data, diskData.data);
			data = this.options.onDataMerged?.(data) ?? data;
		}
		await this.store.saveSafely(data);
		const stat = await this.options.adapter.stat(this.options.primaryPath);
		this.pluginDataMtime = stat?.mtime ?? this.pluginDataMtime;
		return data;
	}
}
