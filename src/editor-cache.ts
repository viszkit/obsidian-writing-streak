export function setTrackedEditorPath<TEditor>(
	filePathByEditor: Map<TEditor, string>,
	editorByFilePath: Map<string, TEditor>,
	editor: TEditor,
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

export function findTrackedValueByPath<TValue extends { file?: { path: string } | null }>(
	values: TValue[],
	path: string
): TValue | null {
	for (const value of values) {
		if (value.file?.path === path) {
			return value;
		}
	}
	return null;
}
