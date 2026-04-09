"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTrackedEditorPath = setTrackedEditorPath;
function setTrackedEditorPath(filePathByEditor, editorByFilePath, editor, path) {
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
