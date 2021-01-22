import { page } from "../page/proxy";
import * as CanvasRenderer from "../render/RedrawCanvas";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

export async function neovim(
        canvas: HTMLCanvasElement,
        { port, password }: { port: number, password: number },
    ) {
    let stdin: Stdin;
    let stdout: Stdout;
    const functions: any = {};
    const requests = new Map<number, { resolve: any, reject: any }>();

    CanvasRenderer.setFunctions(functions);
    CanvasRenderer.setCanvas(canvas);

    const socket = new WebSocket(`ws://127.0.0.1:${port}/${password}`);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("close", ((_: any) => {
        page.killEditor();
    }));
    await (new Promise(resolve => socket.addEventListener("open", () => {
        resolve();
    })));
    stdin = new Stdin(socket);
    stdout = new Stdout(socket);

    let reqId = 0;
    const request = (api: string, args: any[]) => {
        return new Promise((resolve, reject) => {
            reqId += 1;
            requests.set(reqId, {resolve, reject});
            stdin.write(reqId, api, args);
        });
    };
    stdout.addListener("request", (id: any, name: any, args: any) => {
        return undefined;
    });
    stdout.addListener("response", (id: any, error: any, result: any) => {
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
    stdout.addListener("notification", async (name: string, args: any[]) => {
        switch (name) {
            case "redraw":
                if (args) {
                    CanvasRenderer.onRedraw(args);
                }
                break;
            case "firenvim_bufwrite":
                // A very tricky sequence of events could happen here:
                // - firenvim_bufwrite is received page.setElementContent is
                //   called asynchronously
                // - firenvim_focus_page is called, page.focusPage() is called
                //   asynchronously, lastLostFocus is set to now
                // - page.setElementContent completes, lastLostFocus is checked
                //   to see if focus should be grabbed or not
                // That's why we have to check for lastLostFocus after
                // page.setElementContent/Cursor!
                const hadFocus = document.hasFocus();
                const data = args[0] as { text: string[], cursor: [number, number] };
                page.setElementContent(data.text.join("\n"))
                    .then(() => page.setElementCursor(...(data.cursor)))
                    .then(() => {
                        if (hadFocus
                            && !document.hasFocus()
                            && (performance.now() - lastLostFocus > 1000)) {
                            window.focus();
                        }
                    });
                break;
            case "firenvim_eval_js":
                const result = await page.evalInPage(args[0]);
                if (args[1]) {
                    request("nvim_call_function", [args[1], [JSON.stringify(result)]]);
                }
                break;
            case "firenvim_focus_page":
                lastLostFocus = performance.now();
                page.focusPage();
                break;
            case "firenvim_focus_input":
                lastLostFocus = performance.now();
                page.focusInput();
                break;
            case "firenvim_hide_frame":
                lastLostFocus = performance.now();
                page.hideEditor();
                break;
            case "firenvim_press_keys":
                page.pressKeys(args[0]);
                break;
            case "firenvim_vimleave":
                lastLostFocus = performance.now();
                page.killEditor();
                break;
        }
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
