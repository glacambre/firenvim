import * as browser from "webextension-polyfill";
import { computeSelector } from "../utils/CSSUtils";

function executeInPage(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const eventId = (new URL(browser.runtime.getURL(""))).hostname + Math.random();
        script.innerHTML = `((evId) => {
            try {
                let result;
                result = ${code};
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
            script.parentNode.removeChild(script);
            if (detail.success) {
                return resolve(detail.result);
            }
            return reject(detail.reason);
        }, { once: true });
        document.head.appendChild(script);
    });
}

function _getElementContent(e: any): Promise<string> {
    if (e.className.match(/CodeMirror/gi)) {
        return executeInPage(`(${(selec: string) => {
            const elem = document.querySelector(selec) as any;
            return elem.CodeMirror.getValue();
        }})(${JSON.stringify(computeSelector(e))})`);
    } else if (e.className.match(/ace_editor/gi)) {
        return executeInPage(`(${(selec: string) => {
            const elem = document.querySelector(selec) as any;
            return (window as any).ace.edit(elem).getValue();
        }})(${JSON.stringify(computeSelector(e))})`);
    } else if (e.className.match(/monaco/gi)) {
        return executeInPage(`(${(selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.getValue();
        }})(${JSON.stringify(computeSelector(e))})`);
    }
    if (e.value !== undefined) {
        return Promise.resolve(e.value);
    }
    return Promise.resolve(e.innerText);
}

export function getFunctions(global: {
    getConfForUrl: (url: string) => Promise<{ selector: string, priority: number }>,
    lastEditorLocation: [string, string, number],
    nvimify: (evt: FocusEvent) => void,
    putEditorAtInputOrigin: ({ iframe, input }: PageElements) => void,
    selectorToElems: Map<string, PageElements>,
    disabled: boolean | Promise<boolean>,
}) {
    return {
        forceNvimify: () => {
            let elem = document.activeElement;
            if (!elem || elem === document.documentElement || elem === document.body) {
                function isVisible(e: HTMLElement) {
                    const rect = e.getBoundingClientRect();
                    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
                    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
                }
                elem = Array.from(document.getElementsByTagName("textarea"))
                    .find(isVisible);
                if (!elem) {
                    elem = Array.from(document.getElementsByTagName("input"))
                        .find(e => e.type === "text" && isVisible(e));
                }
                if (!elem) {
                    return;
                }
            }
            global.nvimify({ target: elem } as any);
        },
        getEditorLocation: () => {
            // global.lastEditorLocation[1] is a selector. If no selector is
            // defined, we're not the script that should answer this question
            // and thus return a Promise that will never be resolved
            if (global.lastEditorLocation[1] === "") {
                // This cast is wrong but we need it in order to be able to
                // typecheck our proxy in page/proxy.ts. Note that it's ok
                // because the promise will never return anyway.
                return new Promise(() => undefined) as Promise<typeof global.lastEditorLocation>;
            }
            // We need to reset global.lastEditorLocation in order to avoid
            // accidentally giving an already-given selector if we receive a
            // message that isn't addressed to us. Note that this is a hack, a
            // proper fix would be depending on frameIDs, but we can't do that
            // efficiently
            const result = global.lastEditorLocation;
            global.lastEditorLocation = ["", "", 0];
            return Promise.resolve(result);
        },
        getElementContent: (selector: string) => _getElementContent(global.selectorToElems.get(selector).input),
        killEditor: (selector: string) => {
            const { span, input } = global.selectorToElems.get(selector);
            span.parentNode.removeChild(span);
            global.selectorToElems.delete(selector);
            input.removeEventListener("focus", global.nvimify);
            input.focus();
            // Only re-add event listener if input's selector matches the ones
            // that should be autonvimified
            global.getConfForUrl(document.location.href).then(conf => {
                if (conf.selector) {
                    const elems = Array.from(document.querySelectorAll(conf.selector));
                    if (elems.includes(input)) {
                        input.addEventListener("focus", global.nvimify);
                    }
                }
            });
        },
        resizeEditor: (selector: string, width: number, height: number) => {
            const pageElems = global.selectorToElems.get(selector);
            pageElems.iframe.style.width = `${width}px`;
            pageElems.iframe.style.height = `${height}px`;
            global.putEditorAtInputOrigin(pageElems);
        },
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
        },
        setElementContent: (selector: string, text: string) => {
            const { input: e } = global.selectorToElems.get(selector) as any;
            if (e.className.match(/CodeMirror/gi)) {
                return executeInPage(`(${(selec: string, str: string) => {
                    const elem = document.querySelector(selec) as any;
                    return elem.CodeMirror.setValue(str);
                }})(${JSON.stringify(selector)}, ${JSON.stringify(text)})`);
            } else if (e.className.match(/ace_editor/gi)) {
                return executeInPage(`(${(selec: string, str: string) => {
                    const elem = document.querySelector(selec) as any;
                    return (window as any).ace.edit(elem).setValue(str);
                }})(${JSON.stringify(selector)}, ${JSON.stringify(text)})`);
            } else if (e.className.match(/monaco-editor/)) {
                return executeInPage(`(${(selec: string, str: string) => {
                    const elem = document.querySelector(selec) as any;
                    const uri = elem.getAttribute("data-uri");
                    const model = (window as any).monaco.editor.getModel(uri);
                    return model.setValue(str);
                }})(${JSON.stringify(selector)}, ${JSON.stringify(text)})`);
            }
            if (e.value !== undefined) {
                e.value = text;
            } else {
                e.innerText = text;
            }
            e.dispatchEvent(new Event("keydown",     { bubbles: true }));
            e.dispatchEvent(new Event("keyup",       { bubbles: true }));
            e.dispatchEvent(new Event("keypress",    { bubbles: true }));
            e.dispatchEvent(new Event("beforeinput", { bubbles: true }));
            e.dispatchEvent(new Event("input",       { bubbles: true }));
            e.dispatchEvent(new Event("change",      { bubbles: true }));
        },
        setElementCursor: async (selector: string, line: number, column: number) => {
            const { input } = global.selectorToElems.get(selector) as any;
            if (!input.setSelectionRange) {
                return;
            }
            const pos = (await _getElementContent(input))
                .split("\n")
                .reduce((acc: number, l: string, index: number) => acc + (index < (line - 1)
                    ? (l.length + 1)
                    : 0), column + 1);
            input.setSelectionRange(pos, pos);
        },
    };
}
