import { computeSelector } from "./CSSUtils";

const selectorToElems = new Map<string, [HTMLSpanElement, HTMLElement]>();

const functions: any = {
    getEditorLocation: () => lastEditorLocation,
    getElementContent: (selector: string) => {
        const [_, e] = selectorToElems.get(selector) as [any, any];
        if (e.value !== undefined) {
            return e.value;
        }
        if (e.textContent !== undefined) {
            return e.textContent;
        }
        return e.innerText;
    },
    killEditor: (selector: string) => {
        const [e, _] = selectorToElems.get(selector) as [any, any];
        e.parentNode.removeChild(e);
        selectorToElems.delete(selector);
    },
    setElementContent: (selector: string, text: string) => {
        const [_, e] = selectorToElems.get(selector) as [any, any];
        if (e.value !== undefined) {
            e.value = text;
        } else {
            e.textContent = text;
        }
    },
};

browser.runtime.onMessage.addListener(async (request: any, sender: any, sendResponse: any) => {
    if (!functions[request.function]) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return functions[request.function](...(request.args || []));
});

let lastEditorLocation = ["", ""];

function nvimify(evt: FocusEvent) {
    const elem = evt.target as HTMLElement;
    const rect = elem.getBoundingClientRect();
    const iframe = elem.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left + window.scrollX}px`;
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top + window.scrollY}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
    const span = iframe.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
    span.attachShadow({ mode: "closed" }).appendChild(iframe);
    elem.ownerDocument.body.appendChild(span);
    iframe.focus();

    const selector = computeSelector(evt.target as HTMLElement);
    lastEditorLocation = [document.location.href, selector];
    selectorToElems.set(selector, [span, elem]);
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
