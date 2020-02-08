import * as browser from "webextension-polyfill";
import { autofill } from "./autofill";
import { getFunctions } from "./page/functions";
import { confReady, getConf } from "./utils/configuration";
import { computeSelector } from "./utils/CSSUtils";
import { getEditor } from "./editors/editors";

if (document.location.href === "https://github.com/glacambre/firenvim/issues/new") {
    addEventListener("load", autofill);
}

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
    lastEditorLocation: ["", "", 0] as [string, string, number],
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

        const editor = getEditor(evt.target as HTMLElement);
        const elem = editor.getElement();
        const selector = computeSelector(elem);

        // If this element already has a neovim frame, stop
        const alreadyRunning = global.selectorToElems.get(selector);
        if (alreadyRunning !== undefined) {
            alreadyRunning.iframe.style.display = "initial";
            alreadyRunning.iframe.focus();
            return;
        }

        if (auto && (takeover === "empty" || takeover === "nonempty")) {
            const content = await editor.getContent();
            if ((content !== "" && takeover === "empty")
                || (content === "" && takeover === "nonempty")) {
                return;
            }
        }

        const pageElements = { editor, input: elem, selector } as PageElements;
        global.selectorToElems.set(selector, pageElements);

        global.lastEditorLocation = [document.location.href, selector, (elem as any).selectionStart || 0];
        // We use a span because these are the least likely to disturb the page
        const span = elem.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
        pageElements.span = span;
        // It's important to create the iframe last because otherwise it might
        // try to access uninitialized data from the page
        const iframe = span.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
        pageElements.iframe = iframe;

        global.putEditorAtInputOrigin(pageElements);
        // We don't need the iframe to be appended to the page in order to
        // resize it because we're just using the corresponding
        // input/textarea's size
        setEditorSizeToInputSize(pageElements);

        if ((window as any).ResizeObserver !== undefined) {
            let resizeReqId = 0;
            (new ((window as any).ResizeObserver)((entries: any[]) => {
                const entry = entries.find((ent: any) => ent.target === elem);
                if (entry) {
                    const { newRect } = setEditorSizeToInputSize(pageElements);
                    resizeReqId += 1;
                    browser.runtime.sendMessage({
                        args: {
                            args: [resizeReqId, newRect.width, newRect.height],
                            funcName: ["resize"],
                            selector,
                        },
                        funcName: ["messageOwnTab"],
                    });
                }
            })).observe(elem, { box: "border-box" });
        }

        iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        span.attachShadow({ mode: "closed" }).appendChild(iframe);
        elem.ownerDocument.body.appendChild(span);

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
                range.setStart(span, 0);
                range.collapse(true);
                sel.addRange(range);
                // Then, attempt to "release" the focus from whatever element
                // is currently focused.
                window.focus();
                document.documentElement.focus();
                document.body.focus();
                iframe.focus();
            }, 0);
        }
        iframe.addEventListener("blur", refocus);
        elem.addEventListener("focus", refocus);
        setTimeout(() => {
            refocus();
            iframe.removeEventListener("blur", refocus);
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
    },
    putEditorAtInputOrigin: ({ iframe, input }: PageElements) => {
        const rect = input.getBoundingClientRect();
        // Save attributes
        const posAttrs = ["left", "position", "top", "zIndex"];
        const oldPosAttrs = posAttrs.map((attr: any) => iframe.style[attr]);

        // Assign new values
        iframe.style.left = `${rect.left + window.scrollX}px`;
        iframe.style.position = "absolute";
        iframe.style.top = `${rect.top + window.scrollY}px`;
        iframe.style.zIndex = "2147483647";

        const posChanged = !!posAttrs.find((attr: any, index) => iframe.style[attr] !== oldPosAttrs[index]);
        return { posChanged, newRect: rect };
    },

    // selectorToElems: a map of selectors->{input, span, iframe} objects
    selectorToElems: new Map<string, PageElements>(),
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

function setEditorSizeToInputSize({ iframe, input }: PageElements) {
    const rect = input.getBoundingClientRect();
    // Make sure there isn't any extra width/height
    iframe.style.padding = "0px";
    iframe.style.margin = "0px";
    iframe.style.border = "0px";
    // We still need a border, use a shadow for that
    iframe.style.boxShadow = "0px 0px 1px 1px black";

    const dimAttrs = ["height", "width"];
    const oldDimAttrs = dimAttrs.map((attr: any) => iframe.style[attr]);

    // Assign new values
    iframe.style.height = `${rect.height}px`;
    iframe.style.width = `${rect.width}px`;

    const dimChanged = !!dimAttrs.find((attr: any, index) => iframe.style[attr] !== oldDimAttrs[index]);

    return { dimChanged, newRect: rect };
}

function setupListeners(selector: string) {
    function onScroll(cont: boolean) {
        window.requestAnimationFrame(() => {
            const posChanged = Array.from(global.selectorToElems.entries())
                .map(([_, elems]) => global.putEditorAtInputOrigin(elems))
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
