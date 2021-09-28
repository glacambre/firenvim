import { computeSelector } from "./utils/utils";
import { getEditor } from "editor-adapter";

const iframe = document.createElement("iframe");

// Create auth token
const random = new Uint32Array(8);
window.crypto.getRandomValues(random);
const token = Array.from(random).join("");

// Get abstracteditor for focused element
const editor = getEditor(document.activeElement as HTMLElement, {});

function reply(e: MessageEvent<any>, rep: any) {
    e.source.postMessage({
        "funcName": "resolve",
        "args": [rep],
        "reqId": e.data.reqId,
        "token": token,
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
    // Create script tag out of token for insertion in frame HTML.
    // The reason we do this rather than use postMessage is that we can't trust
    // any postMessage without the token.
    const tag = `<script>window.authToken = "${token}"</script>`;
    const blob = new Blob([tag, /* QUTEBROWSER_PAGE */], {type: "text/html; charset=utf-8"});
    iframe.src = URL.createObjectURL(blob);
    document.documentElement.appendChild(iframe);
});
