import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]
import { getConf } from "../utils/configuration";
import { keysToEvents } from "../utils/keys";

interface IGlobalState {
    lastEditorLocation: [string, string, [number, number]];
    nvimify: (evt: FocusEvent) => void;
    firenvimElems: Map<number, PageElements>;
    registerNewFrameId: (frameId: number) => void;
    disabled: boolean | Promise<boolean>;
}

function _focusInput(global: IGlobalState, frameId: number, addListener: boolean) {
    const { firenvim } = global.firenvimElems.get(frameId);
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
        focusInput: (frameId: number) => {
            if (frameId === undefined) {
                const pair = Array.from(global.firenvimElems.entries())
                    .find(([id, instance]: [number, any]) =>
                          instance.getSpan() === document.activeElement);
                if (pair !== undefined) {
                    frameId = pair[0];
                }
            }
            if (frameId !== undefined) {
                _focusInput(global, frameId, true);
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
            return global.lastEditorLocation;
        },
        getElementContent: (frameId: number) => global
            .firenvimElems
            .get(frameId)
            .firenvim
            .getPageElementContent(),
        hideEditor: (frameId: number) => {
            const { firenvim } = global.firenvimElems.get(frameId);
            firenvim.hide();
            _focusInput(global, frameId, true);
        },
        killEditor: (frameId: number) => {
            const { firenvim } = global.firenvimElems.get(frameId);
            firenvim.detachFromPage();
            const conf = getConf();
            _focusInput(global, frameId, conf.takeover !== "once");
            global.firenvimElems.delete(frameId);
        },
        pressKeys: (frameId: number, keys: string[]) => {
            const { firenvim } = global.firenvimElems.get(frameId);
            firenvim.pressKeys(keysToEvents(keys));
        },
        resizeEditor: (frameId: number, width: number, height: number) => {
            const { firenvim } = global.firenvimElems.get(frameId);
            firenvim.resizeTo(width, height);
            firenvim.putEditorAtInputOrigin();
        },
        registerNewFrameId: (frameId: number) => global.registerNewFrameId(frameId),
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
        },
        setElementContent: (frameId: number, text: string) => {
            const { firenvim } = global.firenvimElems.get(frameId) as any;
            firenvim.setPageElementContent(text);
        },
        setElementCursor: (frameId: number, line: number, column: number) => {
            const { firenvim } = global.firenvimElems.get(frameId) as any;
            return firenvim.setPageElementCursor(line, column);
        },
    };
}
