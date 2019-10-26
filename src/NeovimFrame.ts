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
    "F1": "<F1>",
    "F10": "<F10>",
    "F11": "<F11>",
    "F12": "<F12>",
    "F13": "<F13>",
    "F14": "<F14>",
    "F15": "<F15>",
    "F16": "<F16>",
    "F17": "<F17>",
    "F18": "<F18>",
    "F19": "<F19>",
    "F2": "<F2>",
    "F20": "<F20>",
    "F21": "<F21>",
    "F22": "<F22>",
    "F23": "<F23>",
    "F24": "<F24>",
    "F3": "<F3>",
    "F4": "<F4>",
    "F5": "<F5>",
    "F6": "<F6>",
    "F7": "<F7>",
    "F8": "<F8>",
    "F9": "<F9>",
    "Home": "<Home>",
    "PageDown": "<PageDown>",
    "PageUp": "<PageUp>",
    "Tab": "<Tab>",
    "\\": "<Bslash>",
    "|": "<Bar>",
};

// Turns a non-literal key (e.g. "Enter") into a vim-equivalent "<Enter>"
function translateKey(key: string) {
    if (nonLiteralKeys[key] !== undefined) {
        return nonLiteralKeys[key];
    }
    return key;
}

// Add modifier `mod` (`A`, `C`, `S`…) to `text` (a vim key `b`, `<Enter>`,
// `<CS-x>`…)
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
    (window as any).selector = selector;
    const nvimPromise = neovim(host, selector, connectionData);
    const contentPromise = page.getElementContent(selector);

    const [cols, rows] = getGridSize(host);

    const nvim = await nvimPromise;

    // We need to set client info before running ui_attach because we want this
    // info to be available when UIEnter is triggered
    const extInfo = browser.runtime.getManifest();
    const [major, minor, patch] = extInfo.version.split(".");
    const clientInfoPromise = nvim.set_client_info(extInfo.name,
        { major, minor, patch },
        "ui",
        {},
        {},
    );

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
    Promise.all([nvim.command(`noswapfile edit ${filename}`), contentPromise])
        .then(([_, content]: [any, any]) => {
            const promise = nvim.buf_set_lines(0, 0, -1, 0, content.split("\n"))
                .then((__: any) => nvim.command(":w!"));

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

    // Wait for client info to be set and ask for notifications when the file
    // is written/nvim is closed
    clientInfoPromise.then(() => nvim.list_chans())
        .then((channels: any) => {
            const self: any = Object.values(channels)
                .find((channel: any) => channel.client
                    && channel.client.name
                    && channel.client.name.match(new RegExp(extInfo.name, "i")));
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

        // Note: order of this array is important, we need to check OS before checking metaa
        const specialKeys = [["Alt", "A"], ["Control", "C"], ["OS", "D"], ["Meta", "D"]];
        // The event has to be trusted and either have a modifier or a non-literal representation
        if (evt.isTrusted
            && (nonLiteralKeys[evt.key] !== undefined
                || specialKeys.find(([mod, _]: [string, string]) =>
                                    evt.key !== mod && (evt as any).getModifierState(mod)))) {
            const text = specialKeys.concat(["Shift", "S"])
                .reduce((key: string, [attr, mod]: [string, string]) => {
                    if ((evt as any).getModifierState(attr)) {
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
    function onMouse(evt: MouseEvent, action: string) {
        let button;
        if (evt instanceof WheelEvent) {
            button = "wheel";
        } else {
            if (evt.button !== 0 && evt.button !== 2) {
                // Neovim doesn't handle other mouse buttons for now
                return;
            }
            button = evt.button === 0 ? "left" : "right";
        }
        evt.preventDefault();
        evt.stopImmediatePropagation();

        const modifiers = (evt.altKey ? "A" : "") +
            (evt.ctrlKey ? "V" : "") +
            (evt.metaKey ? "D" : "") +
            (evt.shiftKey ? "S" : "");
        const [cWidth, cHeight] = getCharSize(host);
        nvim.input_mouse(button,
                         action,
                         modifiers,
                         0,
                         Math.floor(evt.pageY / cHeight),
                         Math.floor(evt.pageX / cWidth));
        keyHandler.focus();
        setTimeout(() => keyHandler.focus(), 10);
    }
    window.addEventListener("mousedown", e => {
        onMouse(e, "press");
    });
    window.addEventListener("mouseup", e => {
        onMouse(e, "release");
    });
    window.addEventListener("wheel", evt => {
        if (Math.abs(evt.deltaY) >= Math.abs(evt.deltaX)) {
            onMouse(evt, evt.deltaY < 0 ? "up" : "down");
        } else {
            onMouse(evt, evt.deltaX < 0 ? "right" : "left");
        }
    });
    // Let users know when they focus/unfocus the frame
    function setFocusedStyle() {
        document.documentElement.style.opacity = "1";
    }
    function setBluredStyle() {
        document.documentElement.style.opacity = "0.5";
    }
    window.addEventListener("focus", setFocusedStyle);
    window.addEventListener("blur", setBluredStyle);
    keyHandler.focus();
    setTimeout(() => keyHandler.focus(), 10);
});
