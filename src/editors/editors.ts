import { AbstractEditor } from "./AbstractEditor";
import { AceEditor } from "./AceEditor";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { MonacoEditor } from "./MonacoEditor";
import { DraftEditor } from "./DraftEditor";
import { TextareaEditor } from "./TextareaEditor";

export function getEditor(elem: HTMLElement): AbstractEditor {
    switch (true) {
        case AceEditor.matches(elem): return new AceEditor(elem);
        case CodeMirrorEditor.matches(elem): return new CodeMirrorEditor(elem);
        case MonacoEditor.matches(elem): return new MonacoEditor(elem);
        case DraftEditor.matches(elem): return new DraftEditor(elem);
        default: return new TextareaEditor(elem);
    }
}
