import { computeSelector } from "./CSSUtils";
import { getFunctions } from "./page/functions";

const global = {
    lastEditorLocation: ["", ""] as [string, string],
    selectorToElems: new Map<string, [HTMLSpanElement, HTMLElement]>(),
};

const functions = getFunctions(global);

browser.runtime.onMessage.addListener(async (
    // args: [string, string] is factually incorrect but we need to please typescript
    request: { function: keyof typeof functions, args: [string, string] },
    sender: any,
    sendResponse: any,
) => {
    if (!functions[request.function]) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return functions[request.function](...request.args);
});

function nvimify(evt: FocusEvent) {
    const elem = evt.target as HTMLElement;
    const selector = computeSelector(elem as HTMLElement);
    const span = elem.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;

    global.lastEditorLocation = [document.location.href, selector];
    global.selectorToElems.set(selector, [span, elem]);

    const rect = elem.getBoundingClientRect();
    const iframe = span.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left + window.scrollX}px`;
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top + window.scrollY}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
    span.attachShadow({ mode: "closed" }).appendChild(iframe);
    elem.ownerDocument.body.appendChild(span);
    iframe.focus();
}

function isEditable(elem: HTMLElement) {
    return elem.tagName === "TEXTAREA"
        || (elem.tagName === "INPUT" && (elem as HTMLInputElement).type === "text");
}

(new MutationObserver(changes => {
    changes
        .filter((change: MutationRecord) => change.addedNodes.length > 0)
        .forEach((change: MutationRecord) => {
            Array.from(change.addedNodes)
                .filter(node => isEditable(node as HTMLElement))
                .forEach(node => node.addEventListener("focus", nvimify));
        });
})).observe(window.document, { subtree: true, childList: true });
