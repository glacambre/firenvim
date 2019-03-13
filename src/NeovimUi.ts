import { neovim } from "./Neovim";
import { page } from "./page/proxy";

function translateKey(text: string) {
    switch (text) {
        case " ":
            return "<Space>";
        case "ArrowDown":
            return "<Down>";
        case "ArrowLeft":
            return "<Left>";
        case "ArrowRight":
            return "<Right>";
        case "ArrowUp":
            return "<Up>";
        case "Backspace":
            return "<BS>";
        case "Delete":
            return "<Del>";
        case "End":
            return "<End>";
        case "Enter":
            return "<CR>";
        case "Escape":
            return "<Esc>";
        case "Home":
            return "<Home>";
        case "PageDown":
            return "<PageDown>";
        case "PageUp":
            return "<PageUp>";
        case "Tab":
            return "<Tab>";
        case "<":
            return "<lt>";
        case "\\":
            return "<Bslash>";
        case "|":
            return "<Bar>";
    }
    return text;
}

function addModifier(mod: string, text: string) {
    let match;
    let modifiers = "";
    let key = "";
    if ((match = text.match(/^<([A-Z]{1,5})-(.+)>$/))) {
        modifiers = match[1];
        key = match[2];
    } else if ((match = text.match(/^<(.+)>$/))) {
        key = match[1];
    } else {
        key = text;
    }
    return "<" + mod + modifiers + "-" + key + ">";
}

function toFileName(url: string, id: string) {
    const parsedURL = new URL(url);
    const shortId = id.replace(/:nth-of-type/g, "");
    const toAlphaNum = (str: string) => (str.match(/[a-zA-Z0-9]+/g) || [])
        .join("-")
        .slice(-32);
    return `${parsedURL.hostname}_${toAlphaNum(parsedURL.pathname)}_${toAlphaNum(shortId)}.txt`;
}

const locationPromise = page.getEditorLocation();

window.addEventListener("load", async () => {
    const host = document.getElementById("pre") as HTMLPreElement;
    const [url, selector] = await locationPromise;
    const nvimPromise = neovim(host, selector);
    const contentPromise = page.getElementContent(selector);

    // We need to know how tall/wide our characters are in order to know how
    // many rows/cols we can have
    const span = document.createElement("span");
    span.innerText = " ";
    host.appendChild(span);
    const { width: charWidth, height: charHeight } = span.getBoundingClientRect();
    host.removeChild(span);
    const rect = host.getBoundingClientRect();
    const cols = Math.floor(rect.width / charWidth);
    const rows = Math.floor(rect.height / charHeight);

    const nvim = await nvimPromise;

    nvim.ui_attach(cols, rows, {
        ext_linegrid: true,
        rgb: true,
    });
    const filename = toFileName(url, selector);
    Promise.all([nvim.command(`edit ${filename}`), contentPromise])
        .then(([_, content]: [any, string]) => nvim.buf_set_lines(0, 0, -1, 0, content.split("\n")))
        .then((_: any) => nvim.command(":w"));
    nvim.command(`autocmd BufWrite ${filename} `
        + `call rpcnotify(1, 'firenvim_bufwrite', {'text': nvim_buf_get_lines(0, 0, -1, 0)})`);
    nvim.command("autocmd VimLeave * call rpcnotify(1, 'firenvim_vimleave')");
    window.addEventListener("keydown", (evt) => {
        if (evt.isTrusted && !["OS", "AltGraph", "Shift", "Control"].includes(evt.key)) {
            const special = false;
            const text = [["altKey", "A"], ["ctrlKey", "C"], ["metaKey", "M"], ["shiftKey", "S"]]
                .reduce((key: string, [attr, mod]: [string, string]) => {
                    if ((evt as any)[attr]) {
                        return addModifier(mod, key);
                    }
                    return key;
                }, translateKey(evt.key));
            nvim.input(text);
            evt.preventDefault();
            evt.stopImmediatePropagation();
        }
    });
});
