import { page } from "../page/proxy";
import { onRedraw } from "../render/Redraw";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

export async function neovim(
        element: HTMLPreElement,
        extCmdline: HTMLSpanElement,
        extMessages: HTMLSpanElement,
        { port, password }: { port: number, password: number },
    ) {
    let stdin: Stdin;
    let stdout: Stdout;
    const functions: any = {};
    const requests = new Map<number, { resolve: any, reject: any }>();

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
    stdout.addListener("notification", async (name: string, args: any[]) => {
        switch (name) {
            case "redraw":
                if (args) {
                    onRedraw(functions, args, element, extCmdline, extMessages);
                }
                break;
            case "firenvim_bufwrite":
                const hasFocus = document.hasFocus();
                const data = args[0] as { text: string[], cursor: [number, number] };
                page.setElementContent(data.text.join("\n"))
                    .then(() => page.setElementCursor(...(data.cursor)))
                    .then(() => { if (hasFocus && !document.hasFocus()) { window.focus(); } });
                break;
            case "firenvim_eval_js":
                const result = await page.evalInPage(args[0]);
                if (args[1]) {
                    request("nvim_call_function", [args[1], [JSON.stringify(result)]]);
                }
                break;
            case "firenvim_focus_page":
                page.focusPage();
                break;
            case "firenvim_focus_input":
                page.focusInput();
                break;
            case "firenvim_hide_frame":
                page.hideEditor();
                break;
            case "firenvim_press_keys":
                page.pressKeys(args[0]);
                break;
            case "firenvim_vimleave":
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
