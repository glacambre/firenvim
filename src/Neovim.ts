import { Grid } from "./Grid";
import { Stdin } from "./Stdin";
import { Stdout } from "./Stdout";

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

type HighlightUpdate = [number, { foreground: number, background: number }];
type ResizeUpdate = [number, number, number];
type GotoUpdate = [number, number, number];
type LineUpdate = [number, number, number, Array<[string, number, number?]>];

type HighlightMap = Map<number, { foreground: string, background: string }>;

function toHexCss(n: number) {
    const str = n.toString(16);
    // Pad with leading zeros
    return "#" + (new Array(6 - str.length)).join("0") + str;
}

function onRedraw(events: any[], elem: HTMLPreElement, grids: Grid[], highlights: HighlightMap) {
    events.forEach(evt => {
        const [name, ...evts] = evt;
        switch (name) {
            case "option_set":
                // console.log("option_set:", evts);
                break;
            case "hl_attr_define":
                evts.forEach((highlight: HighlightUpdate) => {
                    const [id, { foreground, background }] = highlight;
                    highlights.set(id, {
                        background: toHexCss(background || 16777215),
                        foreground: toHexCss(foreground || 0),
                    });
                });
                break;
            case "default_colors_set":
                // console.log("default_colors_set:", evts);
                break;
            case "grid_resize":
                evts.forEach((resize: ResizeUpdate) => {
                    const [id, width, height] = resize;
                    grids[id] = new Grid(width, height);
                });
                break;
            case "grid_clear":
                evts.forEach((clear: [number]) => grids[clear[0]].clear());
                break;
            case "grid_cursor_goto":
                evts.forEach((cgoto: GotoUpdate) => {
                    const [id, x, y] = cgoto;
                    grids[id].cursor.x = x;
                    grids[id].cursor.y = y;
                });
                break;
            case "grid_line":
                evts.forEach((line: LineUpdate) => {
                    const [id, row, col, contents] = line;
                    contents.reduce((prevCol, content) => {
                        const [chara, high, repeat = 1] = content;
                        const before = grids[id].data[row].slice(0, prevCol);
                        const after = grids[id].data[row].slice(prevCol + repeat);
                        grids[id].data[row] = before
                            .concat((new Array(repeat)).fill(chara))
                            .concat(after);
                        return prevCol + repeat;
                    }, col);
                });
            case "mode_info_set":
                // console.log("mode_info_set:", evts);
                break;
            case "flush":
                const firstGrid = grids.find(g => !!g);
                if (firstGrid) {
                    elem.innerHTML = "";
                    firstGrid.data.forEach((row: any[]) => elem.innerHTML += (row.join("") + "\n"));
                }
                break;
            default:
                // console.log("Unhandled evt:", evt);
                break;
        }
    });
    // console.log(grids, highlights);
}

export async function neovim(element: HTMLPreElement) {
    let stdin: Stdin;
    let stdout: Stdout;
    let reqId = 0;
    const requests = new Map<number | string, ((...args: any[]) => any)>();
    const highlights: HighlightMap = new Map();
    const grids: Grid[] = [];

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
