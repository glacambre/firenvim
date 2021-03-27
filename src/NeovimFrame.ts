import { neovim } from "./HTMLNeovim";
import { page } from "./page/proxy";
import { getCharSize, getGridSize, getGridId, getCurrentMode, onKeyPressed as rendererOnKeyPressed } from "./render/Redraw";
import { confReady, getConfForUrl, getGlobalConf } from "./utils/configuration";
import { addModifier, nonLiteralKeys, translateKey } from "./utils/keys";
import { isChrome, toFileName } from "./utils/utils";

const frameIdPromise = browser
    .runtime
    .sendMessage({ funcName: ["publishFrameId"] })
    .then((f: number) => (window as any).frameId = f);
const infoPromise = frameIdPromise.then(() => page.getEditorInfo());
const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });

export const isReady = new Promise((resolve, reject) => {
    window.addEventListener("load", async () => {
        try {
            const host = document.getElementById("host") as HTMLPreElement;
            const extCmdline = document.getElementById("ext_cmdline") as HTMLSpanElement;
            const extMessages = document.getElementById("ext_messages") as HTMLSpanElement;
            const keyHandler = document.getElementById("keyhandler");
            const [[url, selector, cursor, language], connectionData] =
                await Promise.all([infoPromise, connectionPromise]);
            const nvimPromise = neovim(host, extCmdline, extMessages, connectionData);
            const contentPromise = page.getElementContent();

            const [cols, rows] = getGridSize(host);

            const nvim = await nvimPromise;

            // We need to set client info before running ui_attach because we want this
            // info to be available when UIEnter is triggered
            const extInfo = browser.runtime.getManifest();
            const [major, minor, patch] = extInfo.version.split(".");
            nvim.set_client_info(extInfo.name + Math.random(),
                { major, minor, patch },
                "ui",
                {},
                {},
            );

            await confReady;
            const settings = getGlobalConf();
            nvim.ui_attach(cols, rows, {
                ext_linegrid: true,
                ext_messages: getConfForUrl(url).cmdline === "firenvim",
                rgb: true,
            });

            let resizeReqId = 0;
            browser.runtime.onMessage.addListener((request: any, _sender: any, _sendResponse: any) => {
                if (request.funcName[0] === "sendKey") {
                    nvim.input(request.args.join(""));
                } else if (request.funcName[0] === "resize" && request.args[0] > resizeReqId) {
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
                    nvim.ui_try_resize_grid(getGridId(), nCols, nRows);
                    page.resizeEditor(nCols * cellWidth, nRows * cellHeight);
                }
            });

            // Create file, set its content to the textarea's, write it
            const filename = toFileName(url, selector, language);
            const content = await contentPromise;
            const [line, col] = cursor;
            nvim.call_function("writefile", [content.split("\n"), filename])
                .then(() => nvim.command(`noswapfile edit ${filename} `
                                         + `| call nvim_win_set_cursor(0, [${line}, ${col}])`));

            window.addEventListener("beforeunload", () => {
                nvim.ui_detach();
                nvim.command("qall!");
            });

            // Keep track of last active instance (necessary for firenvim#focus_input() & others)
            const chan = nvim.get_current_channel();
            function setCurrentChan() {
                nvim.set_var("last_focused_firenvim_channel", chan);
            }
            setCurrentChan();
            window.addEventListener("focus", setCurrentChan);
            window.addEventListener("click", setCurrentChan);

            const augroupName = `FirenvimAugroupChan${chan}`;
            // Cleanup means:
            // - notify frontend that we're shutting down
            // - delete file
            // - remove own augroup
            const cleanup = `call rpcnotify(${chan}, 'firenvim_vimleave') | `
                        + `call delete('${filename}')`;
            // Ask for notifications when user writes/leaves firenvim
            nvim.call_atomic((`augroup ${augroupName}
                            au!
                            autocmd BufWrite ${filename} `
                                + `call rpcnotify(${chan}, `
                                    + `'firenvim_bufwrite', `
                                    + `{`
                                        + `'text': nvim_buf_get_lines(0, 0, -1, 0),`
                                        + `'cursor': nvim_win_get_cursor(0),`
                                    + `})
                            au VimLeave * ${cleanup}
                        augroup END`).split("\n").map(command => ["nvim_command", [command]]));

            const ignoreKeys = settings.ignoreKeys;
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

                    const currentMode = getCurrentMode();
                    let keys : string[] = [];
                    if (ignoreKeys[currentMode] !== undefined) {
                        keys = ignoreKeys[currentMode].slice();
                    }
                    if (ignoreKeys.all !== undefined) {
                        keys.push.apply(keys, ignoreKeys.all);
                    }
                    if (!keys.includes(text)) {
                        nvim.input(text);
                        evt.preventDefault();
                        evt.stopImmediatePropagation();
                        rendererOnKeyPressed(text);
                    }
                }
            });

            function acceptInput (evt: any) {
                nvim.input(evt.target.value);
                evt.preventDefault();
                evt.stopImmediatePropagation();
                evt.target.innerText = "";
                evt.target.value = "";
                rendererOnKeyPressed(evt.target.value);
            }
            keyHandler.addEventListener("input", (evt: any) => {
                if (evt.isTrusted && !evt.isComposing) {
                    acceptInput(evt);
                }
            });
            // On Firefox, Pinyin input method for a single chinese character will
            // result in the following sequence of events:
            // - compositionstart
            // - input (character)
            // - compositionend
            // - input (result)
            // But on Chrome, we'll get this order:
            // - compositionstart
            // - input (character)
            // - input (result)
            // - compositionend
            // So Chrome's input event will still have its isComposing flag set to
            // true! This means that we need to add a chrome-specific event
            // listener on compositionend to do what happens on input events for
            // Firefox.
            if (isChrome()) {
                keyHandler.addEventListener("compositionend", () => {
                    acceptInput(event);
                });
            }

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
                                 getGridId(),
                                 Math.floor(evt.pageY / cHeight),
                                 Math.floor(evt.pageX / cWidth));

                keyHandler.focus();
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
            window.addEventListener("focus", () => {
                document.documentElement.style.opacity = "1";
                keyHandler.focus();
                nvim.command("doautocmd FocusGained");
            });
            window.addEventListener("blur", () => {
                document.documentElement.style.opacity = "0.5";
                nvim.command("doautocmd FocusLost");
            });
            keyHandler.focus();
            setTimeout(() => {
                keyHandler.focus();
                resolve();
            }, 10);
        } catch (e) {
            console.error(e);
            page.killEditor();
            reject();
        }
    });
});
