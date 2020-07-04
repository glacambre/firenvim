import { autofill } from "./autofill";
import { getNeovimFrameFunctions, getActiveContentFunctions, getTabFunctions } from "./page/functions";
import { confReady, getConf } from "./utils/configuration";
import { FirenvimElement } from "./FirenvimElement";

if (document.location.href === "https://github.com/glacambre/firenvim/issues/new") {
    addEventListener("load", autofill);
}

// Promise used to implement a locking mechanism preventing concurrent creation
// of neovim frames
let frameIdLock = Promise.resolve();

const global = {
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

const frameFunctions = getNeovimFrameFunctions(global);
const activeFunctions = getActiveContentFunctions(global);
const tabFunctions = getTabFunctions(global);
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

function setupListeners(selector: string) {
    function onScroll(cont: boolean) {
        window.requestAnimationFrame(() => {
            const posChanged = Array.from(global.firenvimElems.entries())
                .map(([_, elem]) => elem.putEditorCloseToInputOrigin())
                .find(changed => changed.posChanged);
            if (posChanged) {
                // As long as one editor changes position, try to resize
                onScroll(true);
            } else if (cont) {
                // No editor has moved, but this might be because the website
                // implements some kind of smooth scrolling that doesn't make
                // the textarea move immediately. In order to deal with these
                // cases, schedule a last redraw in a few milliseconds
                setTimeout(() => onScroll(false), 100);
            }
        });
    }
    function doScroll() {
        return onScroll(true);
    }
    window.addEventListener("scroll", doScroll);
    window.addEventListener("wheel", doScroll);
    (new ((window as any).ResizeObserver)((entries: any[]) => {
        onScroll(true);
    })).observe(document.documentElement);

    function addNvimListener(elem: Element) {
        elem.removeEventListener("focus", global.nvimify);
        elem.addEventListener("focus", global.nvimify);
        let parent = elem.parentElement;
        while (parent) {
            parent.removeEventListener("scroll", doScroll);
            parent.addEventListener("scroll", doScroll);
            parent = parent.parentElement;
        }
    }

    (new MutationObserver((changes, observer) => {
        if (changes.filter(change => change.addedNodes.length > 0).length <= 0) {
            return;
        }
        // This mutation observer is triggered every time an element is
        // added/removed from the page. When this happens, try to apply
        // listeners again, in case a new textarea/input field has been added.
        const toPossiblyNvimify = Array.from(document.querySelectorAll(selector));
        toPossiblyNvimify.forEach(elem => addNvimListener(elem));

        const takeover = getConf().takeover;
        function shouldNvimify(node: any) {
            // Ideally, the takeover !== "never" check shouldn't be performed
            // here: it should live in nvimify(). However, nvimify() only
            // checks for takeover === "never" if it is called from an event
            // handler (this is necessary in order to allow manually nvimifying
            // elements). Thus, we need to check if takeover !== "never" here
            // too.
            return takeover !== "never"
                && document.activeElement === node
                && toPossiblyNvimify.includes(node);
        }

        // We also need to check if the currently focused element is among the
        // newly created elements and if it is, nvimify it.
        // Note that we can't do this unconditionally: we would turn the active
        // element into a neovim frame even for unrelated dom changes.
        for (const mr of changes) {
            for (const node of mr.addedNodes) {
                if (shouldNvimify(node)) {
                    activeFunctions.forceNvimify();
                    return;
                }
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
                while (walker.nextNode()) {
                    if (shouldNvimify(walker.currentNode)) {
                        activeFunctions.forceNvimify();
                        return;
                    }
                }
            }
        }
    })).observe(window.document, { subtree: true, childList: true });

    let elements: HTMLElement[];
    try {
        elements = Array.from(document.querySelectorAll(selector));
    } catch {
        alert(`Firenvim error: invalid CSS selector (${selector}) in your g:firenvim_config.`);
        elements = [];
    }
    elements.forEach(elem => addNvimListener(elem));
}

confReady.then(() => {
    const conf: { selector: string } = getConf();
    if (conf.selector !== undefined && conf.selector !== "") {
        setupListeners(conf.selector);
    }
});
