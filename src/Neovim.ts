import { page } from "./page/proxy";
import { onRedraw } from "./Redraw";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

export async function neovim(element: HTMLPreElement, selector: string) {
    let stdin: Stdin;
    let stdout: Stdout;
    let reqId = 0;
    const requests = new Map<number, { resolve: any, reject: any }>();

    const port = browser.runtime.connect();
    port.onDisconnect.addListener((_: any) => {
        console.log(`Port disconnected for element ${selector}.`);
        page.killEditor(selector);
    });
    stdin = new Stdin(port);
    stdout = new Stdout(port);

    const request = (api: string, args: any[]) => {
        return new Promise((resolve, reject) => {
            reqId += 1;
            const r = requests.get(reqId);
            if (r) {
                console.error(`reqId ${reqId} already taken!`);
            }
            requests.set(reqId, {resolve, reject});
            stdin.write(reqId, api, args);
        });
    };
    stdout.addListener("request", (id: any, name: any, args: any) => {
        console.log("received request", id, name, args);
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
                onRedraw(args, element);
                break;
            case "firenvim_bufwrite":
                page.setElementContent(selector, args[0].text.join("\n"));
                break;
            case "firenvim_vimleave":
                page.killEditor(selector);
                break;
            default:
                console.log(`Unhandled notification '${name}':`, args);
                break;
        }
    });

    const { 1: apiInfo } = (await request("nvim_get_api_info", [])) as INvimApiInfo;
    return apiInfo.functions
        .filter(f => f.deprecated_since === undefined)
        .reduce((acc, cur) => {
            let name = cur.name;
            if (name.startsWith("nvim_")) {
                name = name.slice(5);
            }
            acc[name] = (...args: any[]) => request(cur.name, args);
            return acc;
        }, {} as {[k: string]: (...args: any[]) => any});
}
