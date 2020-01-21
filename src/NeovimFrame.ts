import * as browser from "webextension-polyfill";
import { neovim } from "./nvimproc/Neovim";
import { page } from "./page/proxy";
import { confReady, getConfForUrl } from "./utils/configuration";
import { addModifier, nonLiteralKeys, translateKey } from "./utils/keys";
import { getCharSize, getGridSize, toFileName } from "./utils/utils";

const locationPromise = page.getEditorLocation();
const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNewNeovimInstance"] });
const settingsPromise = browser.storage.local.get("globalSettings");

window.addEventListener("load", async () => {
    try {
        const host = document.getElementById("host") as HTMLPreElement;
        const extCmdline = document.getElementById("ext_cmdline") as HTMLSpanElement;
        const extMessages = document.getElementById("ext_messages") as HTMLSpanElement;
        const keyHandler = document.getElementById("keyhandler");
        const [[url, selector, cursor], connectionData] = await Promise.all([locationPromise, connectionPromise]);
        (window as any).selector = selector;
        const nvimPromise = neovim(host, extCmdline, extMessages, selector, connectionData);
        const contentPromise = page.getElementContent(selector);

        const [cols, rows] = getGridSize(host);

        const nvim = await nvimPromise;

        // We need to set client info before running ui_attach because we want this
        // info to be available when UIEnter is triggered
        const extInfo = browser.runtime.getManifest();
        const [major, minor, patch] = extInfo.version.split(".");
        nvim.set_client_info(extInfo.name,
            { major, minor, patch },
            "ui",
            {},
            {},
        );

        await confReady;
        nvim.ui_attach(cols, rows, {
            ext_linegrid: true,
            ext_messages: getConfForUrl(url).cmdline === "firenvim",
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
                page.resizeEditor(selector, nCols * cellWidth, nRows * cellHeight);
            }
        });

        const filename = toFileName(url, selector);
        const content = await contentPromise;
        nvim.call_function("writefile", [content.split("\n"), filename])
            .then(() => nvim.command(`noswapfile edit ${filename}`))
            .then(() => {
                const beforeCursor = content.slice(0, cursor);
                const newlines = beforeCursor.match(/\n.*/g);
                let line = 1;
                let col = beforeCursor.length;
                if (newlines) {
                    line = newlines.length + 1;
                    col = newlines[newlines.length - 1].length - 1;
                }
                return nvim.win_set_cursor(0, [line, col]);
            });

        // Keep track of last active instance (necessary for firenvim#focus_input() & others)
        const chan = nvim.get_current_channel();
        function setCurrentChan() {
            nvim.set_var("last_focused_firenvim_channel", chan);
        }
        setCurrentChan();
        window.addEventListener("focus", setCurrentChan);
        window.addEventListener("click", setCurrentChan);

        // Ask for notifications when user writes/leaves firenvim
        nvim.call_atomic((`augroup FirenvimAugroup
                        au!
                        autocmd BufWrite ${filename} `
                            + `call rpcnotify(${chan}, `
                                + `'firenvim_bufwrite', `
                                + `{`
                                    + `'text': nvim_buf_get_lines(0, 0, -1, 0),`
                                    + `'cursor': nvim_win_get_cursor(0),`
                                + `})
                        autocmd VimLeave * call delete('${filename}')
                        autocmd VimLeave * call rpcnotify(${chan}, 'firenvim_vimleave')
                    augroup END`).split("\n").map(command => ["nvim_command", [command]]));

        const settings = (await settingsPromise).globalSettings;
        keyHandler.addEventListener("keydown", (evt) => {
            if (evt.altKey && settings.alt === "alphanum" && !/[a-zA-Z0-9]/.test(evt.key)) {
                return;
            }
            // Note: order of this array is important, we need to check OS before checking meta
            const specialKeys = [["Alt", "A"], ["Control", "C"], ["OS", "D"], ["Meta", "D"]];
            // The event has to be trusted and either have a modifier or a non-literal representation
            if (evt.isTrusted
                && (nonLiteralKeys[evt.key] !== undefined
                    || specialKeys.find(([mod, _]: [string, string]) =>
                                        evt.key !== mod && (evt as any).getModifierState(mod)))) {
                const text = specialKeys.concat([["Shift", "S"]])
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
            if (evt.isTrusted && !evt.isComposing) {
                nvim.input(evt.target.value);
                evt.preventDefault();
                evt.stopImmediatePropagation();
                evt.target.innerText = "";
                evt.target.value = "";
            }
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
        window.addEventListener("focus", () => keyHandler.focus());
        keyHandler.focus();
        setTimeout(() => keyHandler.focus(), 10);
    } catch (e) {
        console.error(e);
        const [_, selector] = await locationPromise;
        page.killEditor(selector);
    }
});
