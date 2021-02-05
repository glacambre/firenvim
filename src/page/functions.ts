import { getConf } from "../utils/configuration";
import { keysToEvents } from "../utils/keys";
import { FirenvimElement } from "../FirenvimElement";
import { executeInPage } from "../utils/utils";

interface IGlobalState {
    disabled: boolean | Promise<boolean>;
    lastFocusedContentScript: number;
    firenvimElems: Map<number, FirenvimElement>;
    frameIdResolve: (_: number) => void;
    nvimify: (evt: FocusEvent) => void;
}

function _focusInput(global: IGlobalState, firenvim: FirenvimElement, addListener: boolean) {
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

function getFocusedElement (firenvimElems: Map<number, FirenvimElement>) {
    return Array
        .from(firenvimElems.values())
        .find(instance => instance.isFocused());
}

// Tab functions are functions all content scripts should react to
export function getTabFunctions(global: IGlobalState) {
    return {
        getActiveInstanceCount : () => global.firenvimElems.size,
        registerNewFrameId: (frameId: number) => {
            global.frameIdResolve(frameId);
        },
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
        },
        setLastFocusedContentScript: (frameId: number) => {
            global.lastFocusedContentScript = frameId;
        }
    };
}

// ActiveContent functions are functions only the active content script should react to
export function getActiveContentFunctions(global: IGlobalState) {
    return {
        forceNvimify: () => {
            let elem = document.activeElement;
            const isNull = elem === null || elem === undefined;
            const pageNotEditable = document.documentElement.contentEditable !== "true";
            const bodyNotEditable = (document.body.contentEditable === "false"
                        || (document.body.contentEditable === "inherit"
                            && document.documentElement.contentEditable !== "true"));
            if (isNull
                || (elem === document.documentElement && pageNotEditable)
                || (elem === document.body && bodyNotEditable)) {
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
        sendKey: (key: string) => {
            const firenvim = getFocusedElement(global.firenvimElems);
            if (firenvim !== undefined) {
                firenvim.sendKey(key);
            } else {
                // It's important to throw this error as the background script
                // will execute a fallback
                throw new Error("No firenvim frame selected");
            }
        },
    };
}

export function getNeovimFrameFunctions(global: IGlobalState) {
    return {
        evalInPage: (_: number, js: string) => executeInPage(js),
        focusInput: (frameId: number) => {
            let firenvimElement;
            if (frameId === undefined) {
                firenvimElement = getFocusedElement(global.firenvimElems);
            } else {
                firenvimElement = global.firenvimElems.get(frameId);
            }
            _focusInput(global, firenvimElement, true);
        },
        focusPage: (frameId: number) => {
            const firenvimElement = global.firenvimElems.get(frameId);
            firenvimElement.clearFocusListeners();
            (document.activeElement as any).blur();
            document.documentElement.focus();
        },
        getEditorInfo: (frameId: number) => global
            .firenvimElems
            .get(frameId)
            .getBufferInfo(),
        getElementContent: (frameId: number) => global
            .firenvimElems
            .get(frameId)
            .getPageElementContent(),
        hideEditor: (frameId: number) => {
            const firenvim = global.firenvimElems.get(frameId);
            firenvim.hide();
            _focusInput(global, firenvim, true);
        },
        killEditor: (frameId: number) => {
            const firenvim = global.firenvimElems.get(frameId);
            const isFocused = firenvim.isFocused();
            firenvim.detachFromPage();
            const conf = getConf();
            if (isFocused) {
                _focusInput(global, firenvim, conf.takeover !== "once");
            }
            global.firenvimElems.delete(frameId);
        },
        pressKeys: (frameId: number, keys: string[]) => {
            global.firenvimElems.get(frameId).pressKeys(keysToEvents(keys));
        },
        resizeEditor: (frameId: number, width: number, height: number) => {
            const elem = global.firenvimElems.get(frameId);
            elem.resizeTo(width, height, true);
            elem.putEditorCloseToInputOriginAfterResizeFromFrame();
        },
        setElementContent: (frameId: number, text: string) => {
            return global.firenvimElems.get(frameId).setPageElementContent(text);
        },
        setElementCursor: (frameId: number, line: number, column: number) => {
            return global.firenvimElems.get(frameId).setPageElementCursor(line, column);
        },
    };
}
