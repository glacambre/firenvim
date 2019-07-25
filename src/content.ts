import { getFunctions } from "./page/functions";
import { computeSelector } from "./utils/CSSUtils";

const global = {
    // lastEditorLocation: a [url, selector] tuple indicating the page the last
    // iframe was created on and the selector of the corresponding textarea.
    lastEditorLocation: ["", ""] as [string, string],
    // nvimify: triggered when an element is focused, takes care of creating
    // the editor iframe and appending it to the page.
    nvimify: (evt: FocusEvent) => {
        const elem = evt.target as HTMLElement;
        const selector = computeSelector(elem);

        if (global.selectorToElems.get(selector) !== undefined) {
            return;
        }

        const pageElements = { input: elem, selector } as PageElements;
        global.selectorToElems.set(selector, pageElements);

        global.lastEditorLocation = [document.location.href, selector];
        // We use a span because these are the least likely to disturb the page
        const span = elem.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
        pageElements.span = span;
        // It's important to create the iframe last because otherwise it might
        // try to access uninitialized data from the page
        const iframe = span.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
        pageElements.iframe = iframe;

        // We don't need the iframe to be appended to the page in order to
        // resize it because we're just using the corresponding
        // input/textarea's size
        putEditorOverInput(pageElements);
        // Resizing a textarea changes its "style" attribute
        // This is a hack. We should ideally use a ResizeObserver (
        // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver )
        // but this API doesn't exist in Firefox yet :(
        new MutationObserver((changes, observer) => {
            const { dimChanged, newRect: rect } = putEditorOverInput(pageElements);
            if (dimChanged) {
                resizeReqId += 1;
                browser.runtime.sendMessage({
                    args: {
                        args: [resizeReqId, rect.width, rect.height],
                        funcName : ["resize"],
                        selector,
                    },
                    funcName: ["messageOwnTab"],
                });
            }
        }).observe(elem, { attributes: true, attributeOldValue: true, attributeFilter: ["style"] });

        iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        span.attachShadow({ mode: "closed" }).appendChild(iframe);
        elem.ownerDocument.body.appendChild(span);

        // Some inputs try to grab the focus again after we appended the iframe
        // to the page, so we need to refocus it each time it loses focus. But
        // the user might want to stop focusing the iframe at some point, so we
        // actually stop refocusing the iframe a second after it is created.
        function refocus() {
            setTimeout(() => {
                elem.blur();
                iframe.focus();
            }, 0);
        }
        iframe.addEventListener("blur", refocus);
        elem.addEventListener("focus", refocus);
        setTimeout(() => {
            iframe.removeEventListener("blur", refocus);
            elem.removeEventListener("focus", refocus);
        }, 1000);
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
    // selectorToElems: a map of selectors->{input, span, iframe} objects
    selectorToElems: new Map<string, PageElements>(),
};

const functions = getFunctions(global);
Object.assign(window, functions);

browser.runtime.onMessage.addListener(async (
    // args: [string, string] is factually incorrect but we need to please typescript
    request: { funcName: string[], selector?: string, args: [string, string & number, string & number] },
    sender: any,
    sendResponse: any,
) => {
    if (request.selector) {
        return;
    }
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return fn(...request.args);
});

let resizeReqId = 0;
function putEditorOverInput({ iframe, input, selector }: PageElements) {
    const rect = input.getBoundingClientRect();
    // Make sure there isn't any extra width/height
    iframe.style.padding = "0px";
    iframe.style.margin = "0px";
    iframe.style.border = "0px";
    // We still need a border, use a shadow for that
    iframe.style.boxShadow = "0px 0px 1px 1px black";

    // Save attributes
    const posAttrs = ["left", "position", "top", "zIndex"];
    const oldPosAttrs = posAttrs.map((attr: any) => iframe.style[attr]);
    const dimAttrs = ["height", "width"];
    const oldDimAttrs = dimAttrs.map((attr: any) => iframe.style[attr]);

    // Assign new values
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left + window.scrollX}px`;
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top + window.scrollY}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.style.zIndex = "2147483647";

    const posChanged = !!posAttrs.find((attr: any, index) => iframe.style[attr] !== oldPosAttrs[index]);
    const dimChanged = !!dimAttrs.find((attr: any, index) => iframe.style[attr] !== oldDimAttrs[index]);

    return { posChanged, dimChanged, newRect: rect };
}

function setupListeners(selector: string) {
    function addNvimListener(elem: Element) {
        elem.removeEventListener("focus", global.nvimify);
        elem.addEventListener("focus", global.nvimify);
    }

    (new MutationObserver((changes, observer) => {
        if (changes.filter(change => change.addedNodes.length > 0).length <= 0) {
            return;
        }
        // This mutation observer is triggered every time an element is
        // added/removed from the page. When this happens, try to apply
        // listeners again, in case a new textarea/input field has been added.
        Array.from(document.querySelectorAll(selector))
            .forEach(elem => addNvimListener(elem));
    })).observe(window.document, { subtree: true, childList: true });

    Array.from(document.querySelectorAll(selector))
        .forEach(elem => addNvimListener(elem));

    function onScroll(cont: boolean) {
        window.requestAnimationFrame(() => {
            const posChanged = Array.from(global.selectorToElems.entries())
                .map(([_, elems]) => putEditorOverInput(elems))
                .find(changed => changed.posChanged);
            if (posChanged) {
                // As long as one editor changes position, try to resize
                onScroll(true);
            } else if (cont) {
                // No editor has moved, but this might be because the website
                // implements some kind of smooth scrolling that doesn't make
                // the textarea move immediately. In order to deal with these
                // cases, schedule a last redraw in a few milliseconds
                setTimeout(() => onScroll(false), 50);
            }
        });
    }
    window.addEventListener("scroll", () => onScroll(true));
    window.addEventListener("wheel", () => onScroll(true));
}

browser.storage.sync.get("blacklist").then(async ({ blacklist }: { blacklist: string }) => {
    const matches = blacklist
        .split("\n")
        .find((pat: string) => (new RegExp(pat)).test(document.location.href));
    if (!matches) {
        const match = ((await browser.storage.sync.get("elements"))
            .elements as string)
            .split("\n")
            .map(line => {
                const index = line.indexOf(" ");
                return [line.slice(0, index), line.slice(index + 1)];
            })
            .find(patsel => (new RegExp(patsel[0])).test(document.location.href));
        if (match) {
            setupListeners(match[1]);
        }
    }
});
