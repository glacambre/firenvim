import { getFunctions } from "./page/functions";
import { computeSelector } from "./utils/CSSUtils";

const global = {
    lastEditorLocation: ["", ""] as [string, string],
    nvimify: (evt: FocusEvent) => {
        const elem = evt.target as HTMLElement;
        const selector = computeSelector(elem);

        if (global.selectorToElems.get(selector) !== undefined) {
            return;
        }

        const pageElements = {} as PageElements;
        pageElements.input = elem;
        global.selectorToElems.set(selector, pageElements);

        global.lastEditorLocation = [document.location.href, selector];
        const span = elem.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
        pageElements.span = span;
        // It's important to create the iframe last because otherwise it might
        // try to access uninitialized data from the page
        const iframe = span.ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
        pageElements.iframe = iframe;

        resizeEditor(pageElements);
        window.addEventListener("resize", _ => resizeEditor(pageElements));
        iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        span.attachShadow({ mode: "closed" }).appendChild(iframe);
        elem.ownerDocument.body.appendChild(span);
        function refocus() {
            setTimeout(() => iframe.focus(), 0);
        }
        iframe.addEventListener("blur", refocus);
        setTimeout(() => iframe.removeEventListener("blur", refocus), 1000);
        refocus();
    },
    selectorToElems: new Map<string, PageElements>(),
};

const functions = getFunctions(global);
Object.assign(window, functions);

browser.runtime.onMessage.addListener(async (
    // args: [string, string] is factually incorrect but we need to please typescript
    request: { funcName: string[], args: [string, string & number, string & number] },
    sender: any,
    sendResponse: any,
) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return fn(...request.args);
});

function resizeEditor({ iframe, input }: PageElements) {
    const rect = input.getBoundingClientRect();
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left + window.scrollX}px`;
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top + window.scrollY}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.style.zIndex = "2147483647";
}

function addNvimListener(elem: Element) {
    elem.removeEventListener("focus", global.nvimify);
    elem.addEventListener("focus", global.nvimify);
}

const mutationTimeout = 0;

function setupListeners(selector: string) {
    (new MutationObserver(changes => {
        Array.from(document.querySelectorAll(selector))
            .forEach(elem => addNvimListener(elem));
        // Each time nodes have been removed from the page, check if each of our
        // iframes should be removed from the page. This would be wasteful for
        // large numbers of iframes but we'll never have more than 10 anyway so
        // it's probably ok.
        if (changes.find(change => change.removedNodes.length > 0)) {
            global.selectorToElems.forEach(({input: elem}, select, map) => {
                // If element is not in document or is not visible
                if (!elem.ownerDocument.contains(elem)
                    || (elem.offsetWidth === 0 && elem.offsetHeight === 0 && elem.getClientRects().length === 0)) {
                    functions.killEditor(select);
                }
            });
        }
        global.selectorToElems.forEach(resizeEditor);
    })).observe(window.document, { subtree: true, childList: true });

    Array.from(document.querySelectorAll(selector))
        .forEach(elem => addNvimListener(elem));
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
