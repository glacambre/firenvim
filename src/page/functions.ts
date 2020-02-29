import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]
import { getConf } from "../utils/configuration";
import { keysToEvents } from "../utils/keys";

interface IGlobalState {
    lastEditorLocation: [string, string, [number, number]];
    nvimify: (evt: FocusEvent) => void;
    selectorToElems: Map<string, PageElements>;
    registerNewFrameId: (frameId: number) => void;
    disabled: boolean | Promise<boolean>;
}

// FIXME: Can't focus codemirror/ace/monaco since input != selector?
function _focusInput(global: IGlobalState, selector: string, addListener: boolean) {
    const { firenvim } = global.selectorToElems.get(selector);
    if (addListener) {
        // Only re-add event listener if input's selector matches the ones
        // that should be autonvimified
        const conf = getConf();
        if (conf.selector && conf.selector !== "") {
            const elems = Array.from(document.querySelectorAll(conf.selector));
            addListener = elems.includes(firenvim.getElement());
        }
    }
    firenvim.focusOriginalElement(addListener);
}

export function getFunctions(global: IGlobalState) {
    return {
        focusInput: (selector: string) => {
            if (selector === undefined) {
                selector = Array.from(global.selectorToElems.keys())
                    .find((sel: string) =>
                          global.selectorToElems.get(sel).firenvim.getSpan() === document.activeElement);
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
            global.lastEditorLocation = ["", "", [0, 0]];
            return Promise.resolve(result);
        },
        getElementContent: (selector: string) => global
            .selectorToElems
            .get(selector)
            .firenvim
            .getPageElementContent(),
        hideEditor: (selector: string) => {
            const { firenvim } = global.selectorToElems.get(selector);
            firenvim.hide();
            _focusInput(global, selector, true);
        },
        killEditor: (selector: string) => {
            const { firenvim } = global.selectorToElems.get(selector);
            firenvim.detachFromPage();
            const conf = getConf();
            _focusInput(global, selector, conf.takeover !== "once");
            global.selectorToElems.delete(selector);
        },
        pressKeys: (selector: string, keys: string[]) => {
            const { firenvim } = global.selectorToElems.get(selector);
            firenvim.pressKeys(keysToEvents(keys));
        },
        resizeEditor: (selector: string, width: number, height: number) => {
            const { firenvim } = global.selectorToElems.get(selector);
            firenvim.resizeTo(width, height);
            firenvim.putEditorAtInputOrigin();
        },
        registerNewFrameId: (frameId: number) => global.registerNewFrameId(frameId),
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
        },
        setElementContent: (selector: string, text: string) => {
            const { firenvim } = global.selectorToElems.get(selector) as any;
            firenvim.setPageElementContent(text);
        },
        setElementCursor: async (selector: string, line: number, column: number) => {
            const { firenvim } = global.selectorToElems.get(selector) as any;
            return firenvim.setPageElementCursor(line, column);
        },
    };
}
