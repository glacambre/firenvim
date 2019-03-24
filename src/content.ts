import { computeSelector } from "./CSSUtils";
import { getFunctions } from "./page/functions";

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

        const rect = elem.getBoundingClientRect();
        iframe.style.height = `${rect.height}px`;
        iframe.style.left = `${rect.left + window.scrollX}px`;
        iframe.style.position = "absolute";
        iframe.style.top = `${rect.top + window.scrollY}px`;
        iframe.style.width = `${rect.width}px`;
        iframe.style.zIndex = "2147483647";
        iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        span.attachShadow({ mode: "closed" }).appendChild(iframe);
        elem.ownerDocument.body.appendChild(span);
        iframe.focus();
        window.addEventListener("resize", _ => {
            const contentRect = elem.getBoundingClientRect();
            iframe.style.height = `${contentRect.height}px`;
            iframe.style.left = `${contentRect.left + window.scrollX}px`;
            iframe.style.top = `${contentRect.top + window.scrollY}px`;
            iframe.style.width = `${contentRect.width}px`;
        });
    },
    selectorToElems: new Map<string, PageElements>(),
};

const functions = getFunctions(global);

browser.runtime.onMessage.addListener(async (
    // args: [string, string] is factually incorrect but we need to please typescript
    request: { function: keyof typeof functions, args: [string, string & number, string & number] },
    sender: any,
    sendResponse: any,
) => {
    if (!functions[request.function]) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return functions[request.function](...request.args);
});

function isEditable(elem: HTMLElement) {
    if (elem.tagName === "TEXTAREA"
        || (elem.tagName === "INPUT"
            && ["email", "search", "tel", "text", "url"].includes((elem as HTMLInputElement).type))) {
        return NodeFilter.FILTER_ACCEPT;
    }
    return NodeFilter.FILTER_REJECT;
}

function addNvimListener(elem: HTMLElement) {
    elem.removeEventListener("focus", global.nvimify);
    elem.addEventListener("focus", global.nvimify);
}

function recurseNvimify(elem: HTMLElement) {
    if (isEditable(elem) === NodeFilter.FILTER_ACCEPT) {
        addNvimListener(elem);
        return;
    }
    if (elem.children) {
        Array.from(elem.children).forEach(child => recurseNvimify(child as HTMLElement));
    }
}

(new MutationObserver(changes => {
    changes
        .filter((change: MutationRecord) => change.addedNodes.length > 0)
        .forEach((change: MutationRecord) => Array.from(change.addedNodes)
            .forEach(node => recurseNvimify(node as HTMLElement)),
        );
    // Each time nodes have been removed from the page, check if each of our
    // iframes should be removed from the page. This would be wasteful for
    // large numbers of iframes but we'll never have more than 10 anyway so
    // it's probably ok.
    if (changes.find(change => change.removedNodes.length > 0)) {
        global.selectorToElems.forEach(({input: elem}, selector, map) => {
            // If element is not in document or is not visible
            if (!elem.ownerDocument.contains(elem)
                || (elem.offsetWidth === 0 && elem.offsetHeight === 0 && elem.getClientRects().length === 0)) {
                functions.killEditor(selector);
            }
        });
    }
})).observe(window.document, { subtree: true, childList: true });

const treeWalker = document.createTreeWalker(document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    { acceptNode: isEditable },
);

while (treeWalker.nextNode()) {
    addNvimListener(treeWalker.currentNode as HTMLElement);
}
