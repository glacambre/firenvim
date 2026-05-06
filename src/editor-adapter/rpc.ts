import { EditorClass } from "./AbstractEditor";
import { AceEditor } from "./AceEditor";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { CodeMirror6Editor } from "./CodeMirror6Editor";
import { MonacoEditor } from "./MonacoEditor";

export const editorClasses = {
    AceEditor,
    CodeMirrorEditor,
    CodeMirror6Editor,
    MonacoEditor,
} as const satisfies Record<string, EditorClass>;
