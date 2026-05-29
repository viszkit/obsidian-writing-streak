import { App, Editor, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { countMeaningfulWords } from "./counting";
import type { ActiveDayData } from "./daily-progress";
import { PathInFlightGate } from "./path-inflight";
import {
	createTrackingState,
	getTrackingTotal,
	hasDuplicateObservation,
	initializeFileBaselineFromStoredSnapshot,
	recordObservedFileWords,
	removeTrackedFile,
	removeTrackedFilesWhere,
	renameTrackedFile,
	rollTrackingStateToDate,
	type TrackingState,
} from "./tracking-state";

export interface TrackingControllerDeps {
	app: App;
	getActiveDay(): ActiveDayData;
	setActiveDay(activeDay: ActiveDayData): void;
	todayKey(): string;
	reloadSyncedData(): Promise<void>;
	onProgressChanged(): void;
	onPreviousDayFinalized(dateKey: string, totalWords: number): void;
	isFileExcluded(path: string): boolean;
}

const DEBUG_OBSERVATION_DIAGNOSTICS = false;

function logObservationDiagnostic(event: string, details: Record<string, unknown>) {
	if (!DEBUG_OBSERVATION_DIAGNOSTICS) return;
	console.debug(`[word-goal][tracking] ${event}`, details);
}

function setTrackedEditorPath(
	filePathByEditor: Map<Editor, string>,
	editorByFilePath: Map<string, Editor>,
	editor: Editor,
	path: string
) {
	const previousPath = filePathByEditor.get(editor);
	if (previousPath && previousPath !== path && editorByFilePath.get(previousPath) === editor) {
		editorByFilePath.delete(previousPath);
	}

	const previousEditor = editorByFilePath.get(path);
	if (previousEditor && previousEditor !== editor && filePathByEditor.get(previousEditor) === path) {
		filePathByEditor.delete(previousEditor);
	}

	filePathByEditor.set(editor, path);
	editorByFilePath.set(path, editor);
}

export class TrackingController {
	private state: TrackingState;
	private readonly filePathByEditor = new Map<Editor, string>();
	private readonly editorByFilePath = new Map<string, Editor>();
	private readonly fileInitializationGate = new PathInFlightGate();
	private openViewSnapshotRetryTimer: number | null = null;
	private hasCompletedInitialHydration = false;

	constructor(private readonly deps: TrackingControllerDeps) {
		this.state = createTrackingState(deps.getActiveDay());
	}

	total(): number {
		this.ensureCurrentDay();
		return getTrackingTotal(this.state);
	}

	replaceActiveDay(activeDay: ActiveDayData, options: { preserveLastObserved: boolean }) {
		const lastObservedWordsByPath = options.preserveLastObserved
			? this.state.lastObservedWordsByPath
			: new Map<string, number>();
		this.applyState({ activeDay, lastObservedWordsByPath });
	}

	async handleLayoutReady(): Promise<boolean> {
		await this.deps.reloadSyncedData();
		this.hasCompletedInitialHydration = true;
		const initialized = await this.finalizeOpenViewSnapshotsIfChanged("layout ready");
		if (!initialized) {
			this.scheduleOpenViewSnapshotRetry();
		}
		return initialized;
	}

	handleEditorChange(editor: Editor) {
		if (!this.hasCompletedInitialHydration) return;
		this.ensureCurrentDay();

		const view = this.resolveMarkdownViewForEditor(editor);
		const file = view?.file;
		if (!file || !(file instanceof TFile)) return;
		const previousPath = this.filePathByEditor.get(editor);
		if (this.deps.isFileExcluded(file.path)) {
			const result = removeTrackedFilesWhere(
				this.state,
				(path) => path === file.path || path === previousPath
			);
			this.applyState(result.state);
			this.filePathByEditor.delete(editor);
			if (previousPath) this.editorByFilePath.delete(previousPath);
			this.editorByFilePath.delete(file.path);
			if (result.changed) this.deps.onProgressChanged();
			return;
		}
		if (previousPath && previousPath !== file.path) {
			const result = renameTrackedFile(this.state, previousPath, file.path);
			this.applyState(result.state);
			if (result.changed) {
				this.deps.onProgressChanged();
			}
		}
		setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, editor, file.path);

		void this.observeLiveEditorWords(file, editor, "editor-change")
			.catch((err) => console.error("Failed to track editor change:", err));
	}

	handleActiveLeafChange(leaf: WorkspaceLeaf | null) {
		this.refreshMarkdownEditorCache();
		void this.finalizeSnapshotFromLeafIfChanged(leaf, "active leaf")
			.catch((err) => console.error("Failed to initialize snapshot from active leaf:", err));
	}

	handleFileOpen(file: TFile) {
		if (file.extension !== "md") return;
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return;
		}
		this.refreshMarkdownEditorCache();
		const leaf = this.findMarkdownLeafByPath(file.path);
		void this.finalizeSnapshotFromLeafIfChanged(leaf, "file open")
			.catch((err) => console.error("Failed to initialize snapshot from opened file:", err));
	}

	async handleVaultModify(file: TFile): Promise<void> {
		if (!this.hasCompletedInitialHydration || file.extension !== "md") return;
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return;
		}
		await this.deps.reloadSyncedData();
		const liveEditor = this.editorByFilePath.get(file.path);
		if (liveEditor) {
			await this.observeLiveEditorWords(file, liveEditor, "vault-modify-live-editor");
		} else {
			const words = await this.countStoredFileWords(file);
			if (hasDuplicateObservation(this.state, file.path, words)) return;
			if (!this.state.activeDay.files[file.path]) {
				const changed = await this.ensureFileProgressInitializedFromStorage(file, "vault-modify-stored-file", words);
				if (changed) {
					this.deps.onProgressChanged();
				}
				return;
			}
			if (this.observeFileWords(file, words, "vault-modify-stored-file")) {
				this.deps.onProgressChanged();
			}
		}
	}

	handleFileRename(file: TFile, oldPath: string) {
		if (!this.hasCompletedInitialHydration) return;
		this.ensureCurrentDay();
		if (this.deps.isFileExcluded(file.path)) {
			const result = removeTrackedFilesWhere(
				this.state,
				(path) => path === oldPath || path === file.path
			);
			this.applyState(result.state);
			const editor = this.editorByFilePath.get(oldPath);
			if (editor) {
				this.editorByFilePath.delete(oldPath);
				this.filePathByEditor.delete(editor);
			}
			this.editorByFilePath.delete(file.path);
			if (result.changed) {
				this.deps.onProgressChanged();
			}
			return;
		}
		if (this.deps.isFileExcluded(oldPath)) {
			this.editorByFilePath.delete(oldPath);
			this.refreshMarkdownEditorCache();
			return;
		}
		const result = renameTrackedFile(this.state, oldPath, file.path);
		this.applyState(result.state);
		const editor = this.editorByFilePath.get(oldPath);
		if (editor) {
			this.editorByFilePath.delete(oldPath);
			setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, editor, file.path);
		}
		if (result.changed) {
			this.deps.onProgressChanged();
		}
	}

	pruneExcludedFiles(): boolean {
		const result = removeTrackedFilesWhere(this.state, (path) => this.deps.isFileExcluded(path));
		this.applyState(result.state);
		if (result.changed) {
			this.deps.onProgressChanged();
		}
		return result.changed;
	}

	finalizeToday() {
		if (this.state.activeDay.date) {
			this.deps.onPreviousDayFinalized(this.state.activeDay.date, getTrackingTotal(this.state));
		}
	}

	dispose() {
		if (this.openViewSnapshotRetryTimer !== null) {
			window.clearTimeout(this.openViewSnapshotRetryTimer);
			this.openViewSnapshotRetryTimer = null;
		}
	}

	private applyState(state: TrackingState) {
		this.state = state;
		this.deps.setActiveDay(state.activeDay);
	}

	private ensureCurrentDay() {
		const today = this.deps.todayKey();
		if (this.state.activeDay.date === today) return;
		const result = rollTrackingStateToDate(this.state, today);
		if (result.previousDate) {
			this.deps.onPreviousDayFinalized(result.previousDate, result.previousTotal);
		}
		if (result.changed) {
			this.applyState(result.state);
			if (this.hasCompletedInitialHydration) {
				void this.finalizeOpenViewSnapshotsIfChanged("day rollover")
					.catch((err) => console.error("Failed to initialize snapshots after day rollover:", err));
			}
		}
	}

	private resolveMarkdownViewForEditor(editor: Editor): MarkdownView | null {
		const leaves = this.deps.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file && view.editor === editor) {
				return view;
			}
		}
		return null;
	}

	private findMarkdownLeafByPath(path: string): WorkspaceLeaf | null {
		for (const leaf of this.deps.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path) {
				return leaf;
			}
		}
		return null;
	}

	private async observeLiveEditorWords(file: TFile, editor: Editor, source: string): Promise<void> {
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return;
		}
		const words = this.countEditorWords(file, editor);
		if (hasDuplicateObservation(this.state, file.path, words)) return;

		if (!this.state.activeDay.files[file.path]) {
			await this.ensureFileProgressInitializedFromStorage(file, source, words);
		}

		if (this.observeFileWords(file, words, source)) {
			this.deps.onProgressChanged();
		}
	}

	private observeFileWords(file: TFile, words: number, source: string, observedAt = Date.now()): boolean {
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return false;
		}
		this.ensureCurrentDay();
		const result = recordObservedFileWords(
			this.state,
			this.deps.todayKey(),
			file.path,
			words,
			observedAt
		);
		this.applyState(result.state);
		logObservationDiagnostic("observe-file-words", {
			path: file.path,
			source,
			words,
			observedAt,
			changed: result.changed,
			duplicate: result.duplicate,
			baselineWords: this.state.activeDay.files[file.path]?.baselineWords,
			latestWords: this.state.activeDay.files[file.path]?.latestWords,
		});
		return result.changed;
	}

	private async ensureFileProgressInitializedFromStorage(file: TFile, source: string, liveWords?: number): Promise<boolean> {
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return false;
		}
		this.ensureCurrentDay();
		const path = file.path;
		const dateKey = this.deps.todayKey();
		let changed = false;

		await this.fileInitializationGate.run(path, async () => {
			const storedWords = await this.countStoredFileWords(file);
			const result = initializeFileBaselineFromStoredSnapshot(
				this.state,
				dateKey,
				path,
				storedWords,
				Date.now(),
				liveWords
			);
			this.applyState(result.state);
			if (!result.initialized && !result.repaired) {
				logObservationDiagnostic("skip-storage-backed-initialization", {
					path,
					source,
					storedWords,
					liveWords,
					existingBaselineWords: this.state.activeDay.files[path]?.baselineWords,
					existingLatestWords: this.state.activeDay.files[path]?.latestWords,
				});
				return;
			}
			changed = true;
			logObservationDiagnostic("apply-storage-backed-initialization", {
				path,
				source,
				storedWords,
				liveWords,
				initialized: result.initialized,
				repaired: result.repaired,
				baselineWords: this.state.activeDay.files[path]?.baselineWords,
				latestWords: this.state.activeDay.files[path]?.latestWords,
				nextLastObservedWords: result.nextLastObservedWords,
			});
		});

		return changed;
	}

	private async initializeSnapshotFromLeaf(leaf: WorkspaceLeaf | null): Promise<boolean> {
		if (!leaf) return false;
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return false;
		const file = view.file;
		if (!file) return false;
		if (this.deps.isFileExcluded(file.path)) {
			this.removeFileIfTracked(file.path);
			return false;
		}
		if (!this.hasCompletedInitialHydration) return false;
		try {
			return await this.ensureFileProgressInitializedFromStorage(file, "initialize-snapshot-from-leaf");
		} catch (err) {
			console.error("Failed to initialize snapshot from stored file:", err);
			return false;
		}
	}

	private async finalizeSnapshotFromLeafIfChanged(leaf: WorkspaceLeaf | null, source: string): Promise<boolean> {
		try {
			const changed = await this.initializeSnapshotFromLeaf(leaf);
			if (changed) this.deps.onProgressChanged();
			return changed;
		} catch (err) {
			console.error(`Failed to initialize snapshot from ${source}:`, err);
			return false;
		}
	}

	private async initializeOpenViewSnapshots(): Promise<boolean> {
		let changed = false;
		const leavesByPath = new Map<string, WorkspaceLeaf>();
		for (const leaf of this.deps.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			if (this.deps.isFileExcluded(view.file.path)) continue;
			leavesByPath.set(view.file.path, leaf);
		}

		for (const leaf of leavesByPath.values()) {
			changed = (await this.initializeSnapshotFromLeaf(leaf)) || changed;
		}
		return changed;
	}

	private async finalizeOpenViewSnapshotsIfChanged(source: string): Promise<boolean> {
		try {
			const changed = await this.initializeOpenViewSnapshots();
			if (changed) this.deps.onProgressChanged();
			return changed;
		} catch (err) {
			console.error(`Failed to initialize open view snapshots from ${source}:`, err);
			return false;
		}
	}

	private scheduleOpenViewSnapshotRetry() {
		if (this.openViewSnapshotRetryTimer !== null) {
			window.clearTimeout(this.openViewSnapshotRetryTimer);
		}
		this.openViewSnapshotRetryTimer = window.setTimeout(() => {
			this.openViewSnapshotRetryTimer = null;
			void this.finalizeOpenViewSnapshotsIfChanged("post-layout retry")
				.catch((err) => console.error("Failed to initialize snapshots after layout retry:", err));
		}, 1000);
	}

	private refreshMarkdownEditorCache() {
		this.filePathByEditor.clear();
		this.editorByFilePath.clear();

		for (const leaf of this.deps.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) continue;
			if (this.deps.isFileExcluded(view.file.path)) continue;
			setTrackedEditorPath(this.filePathByEditor, this.editorByFilePath, view.editor, view.file.path);
		}
	}

	private removeFileIfTracked(path: string): boolean {
		const result = removeTrackedFile(this.state, path);
		this.applyState(result.state);
		if (result.changed) {
			this.deps.onProgressChanged();
		}
		return result.changed;
	}

	private countEditorWords(file: TFile, editor: Editor): number {
		return countMeaningfulWords(editor.getValue(), this.deps.app.metadataCache.getCache(file.path));
	}

	private async countStoredFileWords(file: TFile): Promise<number> {
		const content = await this.deps.app.vault.cachedRead(file);
		return countMeaningfulWords(content, this.deps.app.metadataCache.getCache(file.path));
	}
}
