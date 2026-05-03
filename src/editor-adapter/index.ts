import { AbstractEditor, GenericAbstractEditor, wrapper, unwrapper } from "./AbstractEditor";
import { AceEditor } from "./AceEditor";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { CodeMirror6Editor } from "./CodeMirror6Editor";
import { MonacoEditor } from "./MonacoEditor";
import { TextareaEditor } from "./TextareaEditor";

// Computes a unique selector for its argument.
export function computeSelector(element: HTMLElement) {
    function uniqueSelector(e: HTMLElement): string {
        // Only matching alphanumeric selectors because others chars might have special meaning in CSS
        if (e.id && e.id.match("^[a-zA-Z0-9_-]+$")) {
            const id = e.tagName + `[id="${e.id}"]`;
            if (document.querySelectorAll(id).length === 1) {
                return id;
            }
        }
        // If we reached the top of the document
        if (!e.parentElement) { return "HTML"; }
        // Compute the position of the element
        const index =
            Array.from(e.parentElement.children)
                .filter(child => child.tagName === e.tagName)
                .indexOf(e) + 1;
        return `${uniqueSelector(e.parentElement)} > ${e.tagName}:nth-of-type(${index})`;
    }
    return uniqueSelector(element);
}

// Runs CODE in the page's context by setting up a custom event listener,
// embedding a script element that runs the piece of code and emits its result
// as an event.
/* istanbul ignore next */
export function executeInPage(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const eventId = `${Math.random()}`;
        script.innerHTML = `(async (evId) => {
            try {
                let unwrap = x => x;
                let wrap = x => x;
                let result;
                result = await ${code};
                window.dispatchEvent(new CustomEvent(evId, {
                    detail: {
                        success: true,
                        result,
                    }
                }));
            } catch (e) {
                window.dispatchEvent(new CustomEvent(evId, {
                    detail: { success: false, reason: e },
                }));
            }
        })(${JSON.stringify(eventId)})`;
        window.addEventListener(eventId, ({ detail }: any) => {
            script.parentNode?.removeChild(script);
            if (detail.success) {
                return resolve(detail.result);
            }
            return reject(detail.reason);
        }, { once: true });
        document.head.appendChild(script);
    });
}

export function unwrap(x: any) {
    if ((window as any).wrappedJSObject) {
        return x.wrappedJSObject;
    }
    return x;
}

export function wrap(x: any) {
    if ((window as any).XPCNativeWrapper) {
        return (window as any).XPCNativeWrapper(x);
    }
    return x
};

/* Get an object that enables interacting with a text editor's content.
 *
 * @param elem: The element whose contents should be interracted with.
 * @param options:
 *  - preferHTML: True when you need to interract with the editor's HTML, false
 *    otherwise. Useful for e.g. contenteditable elements. Defaults to false.
 *  - codeMirror6Enabled: Whether CodeMirror6 should be considered. Only
 *    supported on Chrome, do not set to true on other platforms. Defaults to
 *    false.
 *  - triggerUpdateEvents: Whether key/change/input events should be triggered
 *    on the elements. Useful to work around badly written TextAreas. Defaults
 *    to true.
 */
export function getEditor(elem: HTMLElement, options: { preferHTML?: boolean, codeMirror6Enabled?: boolean, triggerUpdateEvents?: boolean }): AbstractEditor {
    let editor: typeof GenericAbstractEditor | undefined;
    let classes : (typeof GenericAbstractEditor)[] = [AceEditor, CodeMirrorEditor, MonacoEditor];
    options.triggerUpdateEvents = (!("triggerUpdateEvents" in options)) || options.triggerUpdateEvents;
    if (options.codeMirror6Enabled) {
        classes.push(CodeMirror6Editor);
    }
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
    let result;
    if ((window as any).wrappedJSObject) {
        result = new Proxy(ed, {
            get: (target: any, prop: any) => (...args: any[]) => {
                return target[prop](computeSelector(target.getElement()), wrap, unwrap, ...args);
            }
        });
    } else {
        result = new Proxy(ed, {
            get: (target: any, prop: any) => {
                if (prop === "getElement") {
                    return target[prop];
                }
                return (...args: any[]) => {
                    /* istanbul ignore next */
                    return executeInPage(`(${target[prop]})(${JSON.stringify(computeSelector(target.getElement()))}, x => x, x => x, ...${JSON.stringify(args)})`);
                };
            }
        });
    }
    return result as AbstractEditor;
}
