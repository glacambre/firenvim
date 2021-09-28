import { getEditor } from "editor-adapter";

const editor = getEditor(document.activeElement as HTMLElement, {});

window.addEventListener("message", e => {
    console.log(e)
    if (e.origin !== document.location.origin) {
        console.log("returning", e.origin, document.location.origin);
        return
    }
    if (e.data.funcName === "setContent") {
        editor.setContent(e.data.args[0]);
    }
});

editor.getContent().then(content => {
    const tag = `<script>window.editorContent = ${JSON.stringify(content)}</script>`;
    const iframe = document.createElement("iframe");
    const blob = new Blob([tag, /* QUTEBROWSER_PAGE */], {type: "text/html; charset=utf-8"});
    iframe.src = URL.createObjectURL(blob);
    document.documentElement.appendChild(iframe);
});
