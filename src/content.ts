import * as browser from "webextension-polyfill";
import { autofill } from "./autofill";
import { getFunctions } from "./page/functions";
import { confReady, getConf } from "./utils/configuration";
import { FirenvimElement } from "./FirenvimElement";

if (document.location.href === "https://github.com/glacambre/firenvim/issues/new") {
    addEventListener("load", autofill);
}

// Promise used to implement a locking mechanism preventing concurrent creation
// of neovim frames
let frameIdLock = Promise.resolve();
// Promise-resolution function called when a frameId is received from the
// background script
let frameIdResolve: (_: number) => void;

const global = {
    // Whether Firenvim is disabled in this tab
    disabled: browser.runtime.sendMessage({
                args: ["disabled"],
                funcName: ["getTabValue"],
        })
        // Note: this relies on setDisabled existing in the object returned by
        // getFunctions and attached to the window object
        .then((disabled: boolean) => (window as any).setDisabled(!!disabled)),
    // lastEditorLocation: a [url, selector, cursor] tuple indicating the page
    // the last iframe was created on, the selector of the corresponding
    // textarea and the number of characters before the cursor.
    lastEditorLocation: ["", "", [1, 1]] as [string, string, [number, number]],
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
                frameIdResolve = resolve;
                setTimeout(reject, 10000);
            });
            const firenvim = new FirenvimElement(evt.target as HTMLElement, frameIdPromise);
            frameIdPromise.then(unlock).catch(unlock);

            const editor = firenvim.getEditor();
            const elem = firenvim.getElement();
            const selector = firenvim.getSelector();

            // If this element already has a neovim frame, stop
            const alreadyRunning = global.selectorToElems.get(selector);
            if (alreadyRunning !== undefined) {
                const focusEditor = () => {
                    if ((evt.target as any).blur !== undefined) {
                        (evt.target as any).blur();
                    }
                    alreadyRunning.iframe.focus();
                };
                alreadyRunning.iframe.style.display = "initial";
                focusEditor();
                setTimeout(focusEditor, 10);
                return;
            }

            if (auto && (takeover === "empty" || takeover === "nonempty")) {
                const content = await editor.getContent();
                if ((content !== "" && takeover === "empty")
                    || (content === "" && takeover === "nonempty")) {
                        return;
                    }
            }

            const pageElements = { editor, firenvim, input: elem, selector } as PageElements;
            global.selectorToElems.set(selector, pageElements);

            global.lastEditorLocation = [document.location.href, selector, await editor.getCursor()];
            pageElements.span = firenvim.getSpan();
            pageElements.iframe = firenvim.getIframe();

            firenvim.putEditorAtInputOrigin();
            // We don't need the iframe to be appended to the page in order to
            // resize it because we're just using the corresponding
            // input/textarea's size
            firenvim.setEditorSizeToInputSize();

            pageElements.iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
            pageElements.span.attachShadow({ mode: "closed" }).appendChild(pageElements.iframe);
            elem.ownerDocument.body.appendChild(pageElements.span);

            // Some inputs try to grab the focus again after we appended the iframe
            // to the page, so we need to refocus it each time it loses focus. But
            // the user might want to stop focusing the iframe at some point, so we
            // actually stop refocusing the iframe a second after it is created.
            function refocus() {
                setTimeout(() => {
                    // First, destroy current selection. Some websites use the
                    // selection to force-focus an element.
                    const sel = document.getSelection();
                    sel.removeAllRanges();
                    const range = document.createRange();
                    range.setStart(pageElements.span, 0);
                    range.collapse(true);
                    sel.addRange(range);
                    // Then, attempt to "release" the focus from whatever element
                    // is currently focused.
                    window.focus();
                    document.documentElement.focus();
                    document.body.focus();
                    pageElements.iframe.focus();
                }, 0);
            }
            pageElements.iframe.addEventListener("blur", refocus);
            elem.addEventListener("focus", refocus);
            setTimeout(() => {
                refocus();
                pageElements.iframe.removeEventListener("blur", refocus);
                elem.removeEventListener("focus", refocus);
            }, 100);
            refocus();

            // We want to remove the frame from the page if the corresponding
            // element has been removed. It is pretty hard to tell when an element
            // disappears from the page (either by being removed or by being hidden
            // by other elements), so we use an intersection observer, which is
            // triggered every time the element becomes more or less visible.
            (new IntersectionObserver((entries, observer) => {
                if (!elem.ownerDocument.contains(elem)
                    || (elem.offsetWidth === 0 && elem.offsetHeight === 0 && elem.getClientRects().length === 0)) {
                        functions.killEditor(selector);
                    }
            }, { root: null, threshold: 0.1 })).observe(elem);

        });
    },

    // selectorToElems: a map of selectors->{input, span, iframe} objects
    selectorToElems: new Map<string, PageElements>(),

    // resolve the frameId promise for the last-created frame
    registerNewFrameId: (frameId: number) => frameIdResolve(frameId),
};

// This works as an rpc mechanism, allowing the frame script to perform calls
// in the content script.
const functions = getFunctions(global);
Object.assign(window, functions);
browser.runtime.onMessage.addListener(async (
    request: { funcName: string[], selector?: string, args: [string, string & number, string & number] },
    sender: any,
    sendResponse: any,
) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${JSON.stringify(request)}.`);
    }
    // If this is a selector-specific request and we don't know about this
    // selector, the message is not for us, so we mustn't reply. It'd be better
    // to be able to address messages to specific contexts directly but this is
    // not possible yet: https://bugzilla.mozilla.org/show_bug.cgi?id=1580764
    if (request.selector && !global.selectorToElems.get(request.selector)) {
        return new Promise(() => undefined);
    }
    return fn(...request.args);
});

function setupListeners(selector: string) {
    function onScroll(cont: boolean) {
        window.requestAnimationFrame(() => {
            const posChanged = Array.from(global.selectorToElems.entries())
                .map(([_, elems]) => elems.firenvim.putEditorAtInputOrigin())
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
    if ((window as any).ResizeObserver !== undefined) {
        (new ((window as any).ResizeObserver)((entries: any[]) => {
            onScroll(true);
        })).observe(document.documentElement);
    } else {
        window.addEventListener("resize", doScroll);
    }

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
                    functions.forceNvimify();
                    return;
                }
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
                while (walker.nextNode()) {
                    if (shouldNvimify(walker.currentNode)) {
                        functions.forceNvimify();
                        return;
                    }
                }
            }
        }
    })).observe(window.document, { subtree: true, childList: true });

    Array.from(document.querySelectorAll(selector))
        .forEach(elem => addNvimListener(elem));

}

confReady.then(() => {
    const conf: { selector: string, priority: number } = getConf();
    if (conf.selector) {
        setupListeners(conf.selector);
    }
});
