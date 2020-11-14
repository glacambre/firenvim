import { getConf } from "./utils/configuration";
import { getNeovimFrameFunctions, getActiveContentFunctions, getTabFunctions } from "./page/functions";
import { FirenvimElement } from "./FirenvimElement";

// Promise used to implement a locking mechanism preventing concurrent creation
// of neovim frames
let frameIdLock = Promise.resolve();

export const global = {
    // Whether Firenvim is disabled in this tab
    disabled: browser.runtime.sendMessage({
                args: ["disabled"],
                funcName: ["getTabValue"],
        })
        // Note: this relies on setDisabled existing in the object returned by
        // getFunctions and attached to the window object
        .then((disabled: boolean) => (window as any).setDisabled(!!disabled)),
    // Promise-resolution function called when a frameId is received from the
    // background script
    frameIdResolve: (_: number): void => undefined,
    // lastFocusedContentScript keeps track of the last content frame that has
    // been focused. This is necessary in pages that contain multiple frames
    // (and thus multiple content scripts): for example, if users press the
    // global keyboard shortcut <C-n>, the background script sends a "global"
    // message to all of the active tab's content scripts. For a content script
    // to know if it should react to a global message, it just needs to check
    // if it is the last active content script.
    lastFocusedContentScript: 0,
    // nvimify: triggered when an element is focused, takes care of creating
    // the editor iframe, appending it to the page and focusing it.
    nvimify: async (evt: { target: EventTarget }) => {
        if (global.disabled instanceof Promise) {
            await global.disabled;
        }

        // auto is true when nvimify() is called as an event listener, false
        // when called from forceNvimify()
        const auto = (evt instanceof FocusEvent);

        const takeover = getConf().takeover;
        if (global.disabled || (auto && takeover === "never")) {
            return;
        }

        const firenvim = new FirenvimElement(
            evt.target as HTMLElement,
            global.nvimify,
            (id: number) => global.firenvimElems.delete(id)
        );
        const editor = firenvim.getEditor();

        // If this element already has a neovim frame, stop
        const alreadyRunning = Array.from(global.firenvimElems.values())
            .find((instance) => instance.getElement() === editor.getElement());
        if (alreadyRunning !== undefined) {
            alreadyRunning.show();
            alreadyRunning.focus();
            return;
        }

        if (auto && (takeover === "empty" || takeover === "nonempty")) {
            const content = (await editor.getContent()).trim();
            if ((content !== "" && takeover === "empty")
                || (content === "" && takeover === "nonempty")) {
                    return;
                }
        }

        firenvim.prepareBufferInfo();

        // When creating new frames, we need to know their frameId in order to
        // communicate with them. This can't be retrieved through a
        // synchronous, in-page call so the new frame has to tell the
        // background script to send its frame id to the page. Problem is, if
        // multiple frames are created in a very short amount of time, we
        // aren't guaranteed to receive these frameIds in the order in which
        // the frames were created. So we have to implement a locking mechanism
        // to make sure that we don't create new frames until we received the
        // frameId of the previously created frame.
        let lock;
        while (lock !== frameIdLock) {
            lock = frameIdLock;
            await frameIdLock;
        }
        frameIdLock = new Promise(async (unlock: any) => {
            // TODO: make this timeout the same as the one in background.ts
            const frameIdPromise = new Promise((resolve: (_: number) => void, reject) => {
                global.frameIdResolve = (frameId: number) => {
                    global.firenvimElems.set(frameId, firenvim);
                    global.frameIdResolve = () => undefined;
                    resolve(frameId);
                };
                setTimeout(reject, 10000);
            });
            firenvim.attachToPage(frameIdPromise);
            frameIdPromise
                .then(unlock)
                .catch(unlock);
        });
    },

    firenvimElems: new Map<number, FirenvimElement>(),
};

let ownFrameId: number;
browser.runtime.sendMessage({ args: [], funcName: ["getOwnFrameId"] })
    .then((frameId: number) => { ownFrameId = frameId; });
window.addEventListener("focus", async () => {
    const frameId = ownFrameId;
    global.lastFocusedContentScript = frameId;
    browser.runtime.sendMessage({
        args: {
            args: [ frameId ],
            funcName: ["setLastFocusedContentScript"]
        },
        funcName: ["messagePage"]
    });
});

export const frameFunctions = getNeovimFrameFunctions(global);
export const activeFunctions = getActiveContentFunctions(global);
export const tabFunctions = getTabFunctions(global);
Object.assign(window, frameFunctions, activeFunctions, tabFunctions);
browser.runtime.onMessage.addListener(async (request: { funcName: string[], args: any[] }) => {
    // All content scripts must react to tab functions
    let fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], tabFunctions);
    if (fn !== undefined) {
        return fn(...request.args);
    }

    // The only content script that should react to activeFunctions is the active one
    fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], activeFunctions);
    if (fn !== undefined) {
        if (global.lastFocusedContentScript === ownFrameId) {
            return fn(...request.args);
        }
        return new Promise(() => undefined);
    }

    // The only content script that should react to frameFunctions is the one
    // that owns the frame that sent the request
    fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], frameFunctions);
    if (fn !== undefined) {
        if (global.firenvimElems.get(request.args[0]) !== undefined) {
            return fn(...request.args);
        }
        return new Promise(() => undefined);
    }

    throw new Error(`Error: unhandled content request: ${JSON.stringify(request)}.`);
});

