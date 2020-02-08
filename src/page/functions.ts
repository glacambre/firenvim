import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]
import { getConf } from "../utils/configuration";
import { keysToEvents } from "../utils/keys";
import { isFirefox } from "../utils/utils";

interface IGlobalState {
    lastEditorLocation: [string, string, number];
    nvimify: (evt: FocusEvent) => void;
    putEditorAtInputOrigin: ({ iframe, input }: PageElements) => void;
    selectorToElems: Map<string, PageElements>;
    disabled: boolean | Promise<boolean>;
}

// FIXME: Can't focus codemirror/ace/monaco since input != selector?
function _focusInput(global: IGlobalState, selector: string, addListener: boolean) {
    const { input } = global.selectorToElems.get(selector);
    (document.activeElement as any).blur();
    input.removeEventListener("focus", global.nvimify);
    input.focus();
    if (addListener) {
        // Only re-add event listener if input's selector matches the ones
        // that should be autonvimified
        const conf = getConf();
        if (conf.selector && conf.selector !== "") {
            const elems = Array.from(document.querySelectorAll(conf.selector));
            if (elems.includes(input)) {
                input.addEventListener("focus", global.nvimify);
            }
        }
    }
}

function _refocus(span: any, iframe: any) {
    const sel = document.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(span, 0);
    range.collapse(true);
    sel.addRange(range);
    (document.activeElement as any).blur();
    // On chrome, you can't refocus the iframe once the body has been focused…
    if (isFirefox()) {
        window.focus();
        document.documentElement.focus();
        document.body.focus();
    }
    iframe.focus();
}

export function getFunctions(global: IGlobalState) {
    return {
        focusInput: (selector: string) => {
            if (selector === undefined) {
                selector = Array.from(global.selectorToElems.keys())
                    .find((sel: string) => global.selectorToElems.get(sel).span === document.activeElement);
            }
            if (selector !== undefined) {
                _focusInput(global, selector, true);
            }
        },
        focusPage: () => {
            (document.activeElement as any).blur();
            document.documentElement.focus();
        },
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
        getElementContent: (selector: string) => global.selectorToElems.get(selector).editor.getContent(),
        hideEditor: (selector: string) => {
            const { iframe } = global.selectorToElems.get(selector);
            iframe.style.display = "none";
            _focusInput(global, selector, true);
        },
        killEditor: (selector: string) => {
            const { span } = global.selectorToElems.get(selector);
            span.parentNode.removeChild(span);
            const conf = getConf();
            _focusInput(global, selector, conf.takeover !== "once");
            global.selectorToElems.delete(selector);
        },
        pressKeys: (selector: string, keys: string[]) => {
            const { input, iframe, span } = global.selectorToElems.get(selector);
            keysToEvents(keys).forEach(ev => input.dispatchEvent(ev));
            _refocus(span, iframe);
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
            const { editor, input, iframe, span } = global.selectorToElems.get(selector) as any;
            editor.setContent(text);
            input.dispatchEvent(new Event("keydown",     { bubbles: true }));
            input.dispatchEvent(new Event("keyup",       { bubbles: true }));
            input.dispatchEvent(new Event("keypress",    { bubbles: true }));
            input.dispatchEvent(new Event("beforeinput", { bubbles: true }));
            input.dispatchEvent(new Event("input",       { bubbles: true }));
            input.dispatchEvent(new Event("change",      { bubbles: true }));
            _refocus(span, iframe);
        },
        setElementCursor: async (selector: string, line: number, column: number) => {
            const { editor, input } = global.selectorToElems.get(selector) as any;
            if (!input.setSelectionRange) {
                return;
            }
            const pos = (await editor.getContent())
                .split("\n")
                .reduce((acc: number, l: string, index: number) => acc + (index < (line - 1)
                    ? (l.length + 1)
                    : 0), column + 1);
            input.setSelectionRange(pos, pos);
        },
    };
}
