import { neovim } from "./Neovim";
import { getGridId, getLogicalSize, computeGridDimensionsFor, getGridCoordinates, events as rendererEvents } from "./renderer";
import { confReady, getConfForUrl, NvimMode } from "./utils/configuration";
import { toFileName } from "./utils/utils";
import { PageType } from "./page";
import { KeyHandler } from "./KeyHandler";

export async function setupInput(
    page: PageType,
    canvas: HTMLCanvasElement,
    keyHandler: KeyHandler,
    connectionPromise: Promise<{ port: number, password: string }>,
) {
    try {
        const [[url, selector, cursor, language], connectionData] =
            await Promise.all([page.getEditorInfo(), connectionPromise]);
        const nvimPromise = neovim(page, canvas, connectionData);
        const contentPromise = page.getElementContent();

        const [cols, rows] = getLogicalSize();

        const nvim = await nvimPromise;

        keyHandler.on("input", (s: string) => nvim.input(s));
        rendererEvents.on("modeChange", (s: NvimMode) => keyHandler.setMode(s));

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
        const urlSettings = getConfForUrl(url);
        nvim.ui_attach(
            cols < 1 ? 1 : cols,
            rows < 1 ? 1 : rows,
            {
                ext_linegrid: true,
                ext_messages: urlSettings.cmdline === "firenvim",
                rgb: true,
        }).catch(console.log);

        let resizeReqId = 0;
        page.on("resize", ([id, width, height]: [number, number, number]) => {
            if (id > resizeReqId) {
                resizeReqId = id;
                // We need to put the keyHandler at the origin in order to avoid
                // issues when it slips out of the viewport
                keyHandler.moveTo(0, 0);
                // It's tempting to try to optimize this by only calling
                // ui_try_resize when nCols is different from cols and nRows is
                // different from rows but we can't because redraw notifications
                // might happen without us actually calling ui_try_resize and then
                // the sizes wouldn't be in sync anymore
                const [nCols, nRows] = computeGridDimensionsFor(
                    width * window.devicePixelRatio,
                    height * window.devicePixelRatio
                );
                nvim.ui_try_resize_grid(getGridId(), nCols, nRows);
                page.resizeEditor(Math.floor(width / nCols) * nCols, Math.floor(height / nRows) * nRows);
            }
        });
        page.on("frame_sendKey", (args) => nvim.input(args.join("")));
        page.on("get_buf_content", (r: any) => r(nvim.buf_get_lines(0, 0, -1, 0)));

        // Create file, set its content to the textarea's, write it
        const filename = toFileName(urlSettings.filename, url, selector, language);
        const content = await contentPromise;
        const [line, col] = cursor;
        const writeFilePromise = nvim.call_function("writefile", [content.split("\n"), filename])
            .then(() => nvim.command(`edit ${filename} `
                                     + `| call nvim_win_set_cursor(0, [${line}, ${col}])`));

        // Can't get coverage for this as browsers don't let us reliably
        // push data to the server on beforeunload.
        /* istanbul ignore next */
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

        window.addEventListener("mousemove", (evt: MouseEvent) => {
            keyHandler.moveTo(evt.clientX, evt.clientY);
        });
        function onMouse(evt: MouseEvent, action: string) {
            let button;
            // Selenium can't generate wheel events yet :(
            /* istanbul ignore next */
            if (evt instanceof WheelEvent) {
                button = "wheel";
            } else {
                // Selenium can't generate mouse events with more buttons :(
                /* istanbul ignore next */
                if (evt.button > 2) {
                    // Neovim doesn't handle other mouse buttons for now
                    return;
                }
                button = ["left", "middle", "right"][evt.button];
            }
            evt.preventDefault();
            evt.stopImmediatePropagation();

            const modifiers = (evt.altKey ? "A" : "") +
                (evt.ctrlKey ? "C" : "") +
                (evt.metaKey ? "D" : "") +
                (evt.shiftKey ? "S" : "");
            const [x, y] = getGridCoordinates(evt.pageX, evt.pageY);
            nvim.input_mouse(button,
                             action,
                             modifiers,
                             getGridId(),
                             y,
                             x);
            keyHandler.focus();
        }
        window.addEventListener("mousedown", e => {
            onMouse(e, "press");
        });
        window.addEventListener("mouseup", e => {
            onMouse(e, "release");
        });
        // Selenium doesn't let you simulate mouse wheel events :(
        /* istanbul ignore next */
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
        return new Promise ((resolve, reject) => setTimeout(() => {
            keyHandler.focus();
            writeFilePromise.then(() => resolve(page));
            // To hard to test (we'd need to find a way to make neovim fail
            // to write the file, which requires too many os-dependent side
            // effects), so don't instrument.
            /* istanbul ignore next */
            writeFilePromise.catch(() => reject());
        }, 10));
    } catch (e) {
        console.error(e);
        page.killEditor();
        throw e;
    }
}
