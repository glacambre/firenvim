import { neovim } from "./Neovim";
import { page } from "./page/proxy";

const nonLiteralKeys: {[key: string]: string} = {
    " ": "<Space>",
    "<": "<lt>",
    "ArrowDown": "<Down>",
    "ArrowLeft": "<Left>",
    "ArrowRight": "<Right>",
    "ArrowUp": "<Up>",
    "Backspace": "<BS>",
    "Delete": "<Del>",
    "End": "<End>",
    "Enter": "<CR>",
    "Escape": "<Esc>",
    "Home": "<Home>",
    "PageDown": "<PageDown>",
    "PageUp": "<PageUp>",
    "Tab": "<Tab>",
    "\\": "<Bslash>",
    "|": "<Bar>",
};

function translateKey(key: string) {
    if (nonLiteralKeys[key] !== undefined) {
        return nonLiteralKeys[key];
    }
    return key;
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
    const host = document.getElementById("host") as HTMLPreElement;
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

    const keyHandler = document.getElementById("keyhandler");
    keyHandler.addEventListener("keydown", (evt) => {
        const specialKeys = [["altKey", "A"], ["ctrlKey", "C"], ["metaKey", "M"], ["shiftKey", "S"]];
        // The event has to be trusted and either have a modifier or a non-literal representation
        if (evt.isTrusted
            && (nonLiteralKeys[evt.key] !== undefined
                || specialKeys.find(([attr, _]: [string, string]) => (evt as any)[attr]))) {
            const text = specialKeys
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
    keyHandler.addEventListener("input", (evt: any) => {
        nvim.input(evt.data);
        evt.preventDefault();
        evt.stopImmediatePropagation();
        keyHandler.innerText = "";
    });
    keyHandler.addEventListener("blur", _ => setTimeout(__ => keyHandler.focus(), 0));
    window.addEventListener("click", _ => keyHandler.focus());
    keyHandler.focus();
});
