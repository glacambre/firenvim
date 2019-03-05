import {Stdin} from "./Stdin";
import {Stdout} from "./Stdout";

type NvimParameters = Array<[string, string]>;

interface INvimApiInfo {
    0: number;
    1: {
        error_types: {[key: string]: { id: number }},
        functions: Array<{
            deprecated_since?: number,
            method: boolean,
            name: string,
            parameters: NvimParameters,
            return_type: string,
            since: number,
        }>,
        types: {
            [key: string]: { id: number, prefix: string },
        },
        ui_events: Array<{
            name: string,
            parameters: NvimParameters,
            since: number,
        }>,
        ui_options: string[],
        version: {
            api_compatible: number,
            api_level: number,
            api_prerelease: boolean,
            major: number,
            minor: number,
            patch: number,
        },
    };
}

export async function neovim() {
    let stdin: Stdin;
    let stdout: Stdout;
    let reqId = 0;
    const requests = new Map<number | string, ((...args: any[]) => any)>();

    const port = browser.runtime.connect();
    stdin = new Stdin(port);
    stdout = new Stdout(port);

    const request = (api: string, args: any[]) => {
        reqId += 1;
        const p = new Promise(resolve => requests.set(reqId, (...resp) => {
            requests.delete(reqId);
            resolve(resp);
        }));
        stdin.write(reqId, api, args);
        return p;
    };
    stdout.addListener("message", (id, data1, data2) => {
        requests.get(id)(data1, data2);
    });
    requests.set("redraw", console.log);

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
