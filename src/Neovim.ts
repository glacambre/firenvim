import { onRedraw } from "./Redraw";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

export async function neovim(element: HTMLPreElement) {
    let stdin: Stdin;
    let stdout: Stdout;
    let reqId = 0;
    const requests = new Map<number | string, ((...args: any[]) => any)>();
    const highlights: HighlightArray = [{ background: "#FFFFFF", foreground: "#000000" }];
    const grids: any[] = [];

    const port = browser.runtime.connect();
    stdin = new Stdin(port);
    stdout = new Stdout(port);

    const request = (api: string, args: any[]) => {
        return new Promise(resolve => {
            reqId += 1;
            const r = requests.get(reqId);
            if (r) {
                console.error(`reqId ${reqId} already taken!`);
            }
            requests.set(reqId, (...resp) => {
                requests.delete(reqId);
                resolve(resp);
            });
            stdin.write(reqId, api, args);
        });
    };
    stdout.addListener("message", (id, data1, data2) => {
        const r = requests.get(id);
        if (!r) {
            // This can't happen and yet it sometimes does, possibly due to a firefox bug
            console.error(`Received answer to ${id} but no handler found!`);
        } else {
            r(data1, data2);
        }
    });
    requests.set("redraw", (evt) => onRedraw(evt, element, grids, highlights));

    const [_, apiInfo] = (await request("nvim_get_api_info", [])) as any;
    return (apiInfo as INvimApiInfo)[1]
        .functions
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
