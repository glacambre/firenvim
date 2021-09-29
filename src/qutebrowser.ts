// This is the script that gets executed by qutebrowser's :jseval.
// It runs in a context separate from the page.

import { computeSelector } from "./utils/utils";
import { getEditor } from "editor-adapter";

// Create iframe, append it to shadowroot of span, span will be inserted in
// page once its src has been set
const span = document.createElement("span");
const iframe = document.createElement("iframe");
span.attachShadow({ mode: "closed" }).appendChild(iframe);

const authToken = "QUTEBROWSER_AUTH_TOKEN";

// Get abstracteditor for focused element
const editor = getEditor(document.activeElement as HTMLElement, {});

// A function to reply to requests from the frame.
function reply(e: MessageEvent<any>, rep: any) {
    if (authToken === `QUTEBROWSER${'_'}AUTH${'_'}TOKEN`) {
        console.error("token substitution didn't happen");
        throw new Error("token substitution didn't happen");
    }
    e.source.postMessage({
        "funcName": "resolve",
        "args": [rep],
        "reqId": e.data.reqId,
        "token": authToken,
    }, "*" as WindowPostMessageOptions);
}

// Start listening for message telling us to write to textarea
window.addEventListener("message", async (e) => {
    if (e.origin !== document.location.origin) {
        return
    }
    switch (e.data.funcName) {
        case "focusInput":
            editor.getElement().focus();
            break;
        case "focusPage":
            document.documentElement.focus();
            break;
        case "getEditorInfo":
            const cursor = await editor.getCursor();
            const lang = await editor.getLanguage();
            reply(e, [document.location.href, computeSelector(editor.getElement()), cursor, lang]);
            break;
        case "getElementContent":
            const content = await editor.getContent();
            reply(e, content);
            break;
        case "hideEditor":
            // Needs more thinking
            break;
        case "killEditor":
            iframe.remove()
            break;
        case "resizeEditor":
            iframe.width = e.data.args[0];
            iframe.height = e.data.args[1];
        break;
        case "setElementContent":
            editor.setContent(e.data.args[0]);
        break;
        case "setElementCursor":
            editor.setCursor(e.data.args[0], e.data.args[1]);
        break;
    }
});

editor.getContent().then(content => {
    // QUTEBROWSER_PAGE will be replaced with the content of index.html by the
    // firenvim python script ran by qutebrowser
    const blob = new Blob([/* QUTEBROWSER_PAGE */], {type: "text/html; charset=utf-8"});
    iframe.src = URL.createObjectURL(blob);
    document.documentElement.appendChild(span);
    const rect = editor.getElement().getBoundingClientRect();
    iframe.width = rect.width + "px";
    iframe.height = rect.height + "px";
    iframe.style.border = "0px";
    iframe.style.boxShadow = "0px 0px 1px 1px black";
    iframe.style.height = `${rect.height}px`;
    iframe.style.left = `${rect.left + window.scrollX}px`;
    iframe.style.margin = "0px";
    iframe.style.padding = "0px";
    iframe.style.position = "absolute";
    iframe.style.top = `${rect.top + window.scrollY}px`;
    iframe.style.width = `${rect.width}px`;
    iframe.style.zIndex = "2139999995";
});
