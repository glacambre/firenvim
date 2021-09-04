import { PageType } from "./page"
import * as CanvasRenderer from "./renderer";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

export async function neovim(
        page: PageType,
        canvas: HTMLCanvasElement,
        { port, password }: { port: number, password: string },
    ) {
    const functions: any = {};
    const requests = new Map<number, { resolve: any, reject: any }>();

    CanvasRenderer.setCanvas(canvas);
    CanvasRenderer.events.on("resize", ({grid, width, height}: any) => {
        (functions as any).ui_try_resize_grid(grid, width, height);
    });
    CanvasRenderer.events.on("frameResize", ({width, height}: any) => {
        page.resizeEditor(width, height);
    });

    let prevNotificationPromise = Promise.resolve();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/${password}`);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("close", ((_: any) => {
        prevNotificationPromise = prevNotificationPromise.finally(() => page.killEditor());
    }));
    await (new Promise(resolve => socket.addEventListener("open", () => {
        resolve(undefined);
    })));
    const stdin = new Stdin(socket);
    const stdout = new Stdout(socket);

    let reqId = 0;
    const request = (api: string, args: any[]) => {
        return new Promise((resolve, reject) => {
            reqId += 1;
            requests.set(reqId, {resolve, reject});
            stdin.write(reqId, api, args);
        });
    };
    stdout.on("request", (id: number, name: any, args: any) => {
        console.warn("firenvim: unhandled request from neovim", id, name, args);
    });
    stdout.on("response", (id: any, error: any, result: any) => {
        const r = requests.get(id);
        if (!r) {
            // This can't happen and yet it sometimes does, possibly due to a firefox bug
            console.error(`Received answer to ${id} but no handler found!`);
        } else {
            requests.delete(id);
            if (error) {
                r.reject(error);
            } else {
                r.resolve(result);
            }
        }
    });

    let lastLostFocus = performance.now();
    stdout.on("notification", async (name: string, args: any[]) => {
        if (name === "redraw" && args) {
            CanvasRenderer.onRedraw(args);
            return;
        }
        prevNotificationPromise = prevNotificationPromise.finally(() => {
            // A very tricky sequence of events could happen here:
            // - firenvim_bufwrite is received page.setElementContent is called
            //   asynchronously
            // - firenvim_focus_page is called, page.focusPage() is called
            //   asynchronously, lastLostFocus is set to now
            // - page.setElementContent completes, lastLostFocus is checked to see
            //   if focus should be grabbed or not
            // That's why we have to check for lastLostFocus after
            // page.setElementContent/Cursor! Same thing for firenvim_press_keys
            const hadFocus = document.hasFocus();
            switch (name) {
                case "firenvim_bufwrite":
                    {
                    const data = args[0] as { text: string[], cursor: [number, number] };
                    return page.setElementContent(data.text.join("\n"))
                        .then(() => page.setElementCursor(...(data.cursor)))
                        .then(() => {
                            if (hadFocus
                                && !document.hasFocus()
                                && (performance.now() - lastLostFocus > 3000)) {
                                window.focus();
                            }
                        });
                    }
                case "firenvim_eval_js":
                    return page.evalInPage(args[0]).catch(_ => _).then(result => {
                        if (args[1]) {
                            request("nvim_call_function", [args[1], [JSON.stringify(result)]]);
                        }
                    });
                case "firenvim_focus_page":
                    lastLostFocus = performance.now();
                    return page.focusPage();
                case "firenvim_focus_input":
                    lastLostFocus = performance.now();
                    return page.focusInput();
                case "firenvim_hide_frame":
                    lastLostFocus = performance.now();
                    return page.hideEditor();
                case "firenvim_press_keys":
                    return page.pressKeys(args[0]);
                case "firenvim_vimleave":
                    lastLostFocus = performance.now();
                    return page.killEditor();
                case "firenvim_thunderbird_send":
                    return browser.runtime.sendMessage({
                        args: [],
                        funcName: ["thunderbirdSend"],
                    });
            }
        });
    });

    const { 0: channel, 1: apiInfo } = (await request("nvim_get_api_info", [])) as INvimApiInfo;

    stdout.setTypes(apiInfo.types);

    Object.assign(functions, apiInfo.functions
        .filter(f => f.deprecated_since === undefined)
        .reduce((acc, cur) => {
            let name = cur.name;
            if (name.startsWith("nvim_")) {
                name = name.slice(5);
            }
            acc[name] = (...args: any[]) => request(cur.name, args);
            return acc;
        }, {} as {[k: string]: (...args: any[]) => any}));
    functions.get_current_channel = () => channel;
    return functions;
}
