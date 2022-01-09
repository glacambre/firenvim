import { EventEmitter    } from "./EventEmitter";
import { FirenvimElement } from "./FirenvimElement";
import { executeInPage   } from "./utils/utils";
import { getConf         } from "./utils/configuration";
import { keysToEvents    } from "./utils/keys";

// This module is loaded in both the browser's content script, the browser's
// frame script and thunderbird's compose script.
// As such, it should not have any side effects.

interface IGlobalState {
    disabled: boolean | Promise<boolean>;
    lastFocusedContentScript: number;
    firenvimElems: Map<number, FirenvimElement>;
    frameIdResolve: (_: number) => void;
    nvimify: (evt: FocusEvent) => void;
}

/////////////////////////////////////////////
// Functions running in the content script //
/////////////////////////////////////////////

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

function isVisible(e: HTMLElement) {
    const rect = e.getBoundingClientRect();
    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
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

function focusElementBeforeOrAfter(global: IGlobalState, frameId: number, i: 1 | -1) {
    let firenvimElement;
    if (frameId === undefined) {
        firenvimElement = getFocusedElement(global.firenvimElems);
    } else {
        firenvimElement = global.firenvimElems.get(frameId);
    }
    const originalElement = firenvimElement.getOriginalElement();

    const tabindex = (e: Element) => ((x => isNaN(x) ? 0 : x)(parseInt(e.getAttribute("tabindex"))));
    const focusables = Array.from(document.querySelectorAll("input, select, textarea, button, object, [tabindex], [href]"))
        .filter(e => e.getAttribute("tabindex") !== "-1")
        .sort((e1, e2) => tabindex(e1) - tabindex(e2));

    let index = focusables.indexOf(originalElement);
    let elem: Element;
    if (index === -1) {
        // originalElement isn't in the list of focusables, so we have to
        // figure out what the closest element is. We do this by iterating over
        // all elements of the dom, accepting only originalElement and the
        // elements that are focusable. Once we find originalElement, we select
        // either the previous or next element depending on the value of i.
        const treeWalker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: n => ((n === originalElement || focusables.indexOf((n as Element)) !== -1)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT)
            },
        );
        const firstNode = treeWalker.currentNode as Element;
        let cur = firstNode;
        let prev;
        while (cur && cur !== originalElement) {
            prev = cur;
            cur = treeWalker.nextNode() as Element;
        }
        if (i > 0) {
            elem = treeWalker.nextNode() as Element;
        } else {
            elem = prev;
        }
        // Sanity check, can't be exercised
        /* istanbul ignore next */
        if (!elem) {
            elem = firstNode;
        }
    } else {
        elem = focusables[(index + i + focusables.length) % focusables.length];
    }

    index = focusables.indexOf(elem);
    // Sanity check, can't be exercised
    /* istanbul ignore next */
    if (index === -1) {
        throw "Oh my, something went wrong!";
    }

    // Now that we know we have an element that is in the focusable element
    // list, iterate over the list to find one that is visible.
    let startedAt;
    let style = getComputedStyle(elem);
    while (startedAt !== index && (style.visibility !== "visible" || style.display === "none")) {
        if (startedAt === undefined) {
            startedAt = index;
        }
        index = (index + i + focusables.length) % focusables.length;
        elem = focusables[index];
        style = getComputedStyle(elem);
    }

    (document.activeElement as any).blur();
    const sel = document.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    if (elem.ownerDocument.contains(elem)) {
        range.setStart(elem, 0);
    }
    range.collapse(true);
    (elem as HTMLElement).focus();
    sel.addRange(range);
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
        focusNext: (frameId: number) => {
            focusElementBeforeOrAfter(global, frameId, 1);
        },
        focusPrev: (frameId: number) => {
            focusElementBeforeOrAfter(global, frameId, -1);
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

//////////////////////////////////////////////////////////////////////////////
// Definition of a proxy type that lets the frame script transparently call //
// the content script's functions                                           //
//////////////////////////////////////////////////////////////////////////////
;

// The proxy automatically appends the frameId to the request, so we hide that from users
type ArgumentsType<T> = T extends (x: any, ...args: infer U) => any ? U: never;
type Promisify<T> = T extends Promise<any> ? T : Promise<T>;

type ft = ReturnType<typeof getNeovimFrameFunctions>

type PageEvents = "resize" | "frame_sendKey" | "get_buf_content" | "pause_keyhandler";
type PageHandlers = (args: any[]) => void;
export class PageEventEmitter extends EventEmitter<PageEvents, PageHandlers> {
    constructor() {
        super();
        browser.runtime.onMessage.addListener((request: any, _sender: any, _sendResponse: any) => {
            switch (request.funcName[0]) {
                case "pause_keyhandler":
                case "frame_sendKey":
                case "resize":
                    this.emit(request.funcName[0], request.args);
                    break;
                case "get_buf_content":
                    return new Promise(resolve => this.emit(request.funcName[0], resolve));
                case "evalInPage":
                case "resizeEditor":
                case "getElementContent":
                case "getEditorInfo":
                    // handled by frame function handler
                    break;
                default:
                    console.error("Unhandled page request:", request);
            }
        });
    }
}

export type PageType = PageEventEmitter & {
    [k in keyof ft]: (...args: ArgumentsType<ft[k]>) => Promisify<ReturnType<ft[k]>>;
};

export function getPageProxy (frameId: number) {
    const page = new PageEventEmitter();

    let funcName: keyof PageType;
    for (funcName in getNeovimFrameFunctions({} as any)) {
        // We need to declare func here because funcName is a global and would not
        // be captured in the closure otherwise
        const func = funcName;
        (page as any)[func] = ((...arr: any[]) => {
            return browser.runtime.sendMessage({
                args: {
                    args: [frameId].concat(arr),
                    funcName: [func],
                },
                funcName: ["messagePage"],
            });
        });
    }
    return page as PageType;
};
