import * as browser from "webextension-polyfill";
import { neovim } from "./nvimproc/Neovim";
import { page } from "./page/proxy";
import { getCharSize, getGridSize, toFileName } from "./utils/utils";

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
const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNewNeovimInstance"] });

window.addEventListener("load", async () => {
    const host = document.getElementById("host") as HTMLPreElement;
    const keyHandler = document.getElementById("keyhandler");
    const [[url, selector, cursor], connectionData] = await Promise.all([locationPromise, connectionPromise]);
    const nvimPromise = neovim(host, selector, connectionData);
    const contentPromise = page.getElementContent(selector);

    const [cols, rows] = getGridSize(host);

    const nvim = await nvimPromise;

    nvim.ui_attach(cols, rows, {
        ext_linegrid: true,
        rgb: true,
    });
    let resizeReqId = 0;
    browser.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
        if (request.selector === selector
            && request.funcName[0] === "resize"
            && request.args[0] > resizeReqId) {
            const [id, width, height] = request.args;
            resizeReqId = id;
            // We need to put the keyHandler at the origin in order to avoid
            // issues when it slips out of the viewport
            keyHandler.style.left = `0px`;
            keyHandler.style.top = `0px`;
            // It's tempting to try to optimize this by only calling
            // ui_try_resize when nCols is different from cols and nRows is
            // different from rows but we can't because redraw notifications
            // might happen without us actually calling ui_try_resize and then
            // the sizes wouldn't be in sync anymore
            const [cellWidth, cellHeight] = getCharSize(host);
            const nCols = Math.floor(width / cellWidth);
            const nRows = Math.floor(height / cellHeight);
            nvim.ui_try_resize(nCols, nRows);
        }
    });

    // Create file, set its content to the textarea's, write it
    const filename = toFileName(url, selector);
    Promise.all([nvim.command(`edit ${filename}`), contentPromise])
        .then(([_, content]: [any, string]) => {
            const promise = nvim.buf_set_lines(0, 0, -1, 0, content.split("\n"))
                .then((__: any) => nvim.command(":w"));

            const beforeCursor = content.slice(0, cursor);
            const newlines = beforeCursor.match(/\n.*/g);
            let line = 1;
            let col = beforeCursor.length;
            if (newlines) {
                line = newlines.length + 1;
                col = newlines[newlines.length - 1].length - 1;
            }
            return promise.then((__: any) => nvim.win_set_cursor(0, [line, col]));
        });

    // Set client info and ask for notifications when the file is written/nvim is closed
    const extInfo = browser.runtime.getManifest();
    const [major, minor, patch] = extInfo.version.split(".");
    nvim.set_client_info(extInfo.name,
        { major, minor, patch },
        "ui",
        {},
        {},
    )
        .then(() => nvim.list_chans())
        .then((channels: any) => {
            const self: any = Object.values(channels)
                .find((channel: any) => channel.client && channel.client.name.match(new RegExp(extInfo.name, "i")));
            if (!self) {
                throw new Error("Couldn't find own channel.");
            }
            nvim.call_atomic((`augroup FirenvimAugroup
                            au!
                            autocmd BufWrite ${filename} `
                                + `call rpcnotify(${self.id}, `
                                    + `'firenvim_bufwrite', `
                                    + `{`
                                        + `'text': nvim_buf_get_lines(0, 0, -1, 0),`
                                        + `'cursor': nvim_win_get_cursor(0),`
                                    + `})
                            autocmd VimLeave * call delete('${filename}')
                            autocmd VimLeave * call rpcnotify(${self.id}, 'firenvim_vimleave')
                        augroup END`).split("\n").map(command => ["nvim_command", [command]]));
        });

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
        nvim.input(evt.target.value);
        evt.preventDefault();
        evt.stopImmediatePropagation();
        evt.target.innerText = "";
        evt.target.value = "";
    });
    window.addEventListener("mousemove", (evt: MouseEvent) => {
        keyHandler.style.left = `${evt.clientX}px`;
        keyHandler.style.top = `${evt.clientY}px`;
    });
    window.addEventListener("click", _ => keyHandler.focus());
    keyHandler.focus();
    // Let users know when they focus/unfocus the frame
    function setFocusedStyle() {
        document.documentElement.style.opacity = "1";
    }
    function setBluredStyle() {
        document.documentElement.style.opacity = "0.5";
    }
    window.addEventListener("focus", setFocusedStyle);
    window.addEventListener("blur", setBluredStyle);
});
