
function nvimify(evt: Event) {
    const elem = evt.target as HTMLElement;
    const [rect, _] = elem.getClientRects();
    const iframe = elem.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left}px`;
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
    const span = iframe.ownerDocument
        .createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
    span.attachShadow({ mode: "closed" }).appendChild(iframe);
    elem.ownerDocument.body.appendChild(span);
    iframe.focus();
    console.log(iframe);
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
