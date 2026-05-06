import { computeSelector } from "../utils/utils";
import { AbstractEditor, EditorClass } from "./AbstractEditor";
import { AceEditor } from "./AceEditor";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { CodeMirror6Editor } from "./CodeMirror6Editor";
import { MonacoEditor } from "./MonacoEditor";
import { TextareaEditor } from "./TextareaEditor";

/* Get an object that enables interacting with a text editor's content.
 *
 * @param elem: The element whose contents should be interracted with.
 * @param options:
 *  - preferHTML: True when you need to interract with the editor's HTML, false
 *    otherwise. Useful for e.g. contenteditable elements. Defaults to false.
 */
export function getEditor(elem: HTMLElement, options: { preferHTML?: boolean }): AbstractEditor {
    let editor: EditorClass | undefined;
    let classes: EditorClass[] = [AceEditor, CodeMirrorEditor, MonacoEditor, CodeMirror6Editor];
    for (let clazz of classes) {
        if (clazz.matches(elem)) {
            editor = clazz;
            break;
        }
    }
    if (editor === undefined) {
        return new TextareaEditor(elem, options);
    }
    let ed = new editor(elem, options);
    const className = editor.name;
    const selector = computeSelector(ed.getElement());
    const result = new Proxy(ed, {
        get: (target: any, prop: any) => {
            if (prop === "getElement") {
                return () => target.getElement();
            }
            return (...args: any[]) => browser.runtime.sendMessage({
                funcName: ["editor"],
                args: {
                    className,
                    procName: prop,
                    procArgs: [selector, ...args],
                },
            });
        }
    });
    return result as AbstractEditor;
}
