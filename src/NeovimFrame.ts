import { neovim } from "./nvimproc/Neovim";
import { page } from "./page/proxy";
import { getGridSize, toFileName } from "./utils/utils";

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

const locationPromise = page.getEditorLocation();

window.addEventListener("load", async () => {
    const host = document.getElementById("host") as HTMLPreElement;
    const keyHandler = document.getElementById("keyhandler");
    const [url, selector] = await locationPromise;
    const nvimPromise = neovim(host, selector);
    const contentPromise = page.getElementContent(selector);

    const [cols, rows] = getGridSize(host);

    const nvim = await nvimPromise;

    nvim.ui_attach(cols, rows, {
        ext_linegrid: true,
        rgb: true,
    });
    window.addEventListener("resize", _ => {
        keyHandler.style.left = `0px`;
        keyHandler.style.top = `0px`;
        const [nCols, nRows] = getGridSize(host);
        nvim.ui_try_resize(nCols, nRows);
    });

    const filename = toFileName(url, selector);
    Promise.all([nvim.command(`edit ${filename}`), contentPromise])
        .then(([_, content]: [any, string]) => nvim.buf_set_lines(0, 0, -1, 0, content.split("\n")))
        .then((_: any) => nvim.command(":w"));
    nvim.command(`autocmd BufWrite ${filename} `
        + `call rpcnotify(1, 'firenvim_bufwrite', {'text': nvim_buf_get_lines(0, 0, -1, 0)})`);
    nvim.command("autocmd VimLeave * call rpcnotify(1, 'firenvim_vimleave')");

    keyHandler.addEventListener("keydown", (evt) => {
        keyHandler.style.left = `0px`;
        keyHandler.style.top = `0px`;

        const specialKeys = [["altKey", "A"], ["ctrlKey", "C"], ["metaKey", "M"]];
        // The event has to be trusted and either have a modifier or a non-literal representation
        if (evt.isTrusted
            && (nonLiteralKeys[evt.key] !== undefined
                || specialKeys.find(([attr, _]: [string, string]) => (evt as any)[attr]))) {
            const text = specialKeys.concat(["shiftKey", "S"])
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
    window.addEventListener("mousemove", (evt: MouseEvent) => {
        keyHandler.style.left = `${evt.clientX}px`;
        keyHandler.style.top = `${evt.clientY}px`;
    });
    window.addEventListener("click", _ => keyHandler.focus());
    keyHandler.focus();
});
