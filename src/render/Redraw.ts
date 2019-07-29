// lgtm[js/unused-local-variable]
import * as browser from "webextension-polyfill";
import { page } from "../page/proxy";
import { toCss, toHexCss } from "../utils/CSSUtils";
import { getCharSize } from "../utils/utils";
import { Grid } from "./Grid";

const defaultColors = { background: 16777215, foreground: 0 };
const grids: Grid[] = [];
const highlights: HighlightArray = [{ background: "#FFFFFF", foreground: "#000000" }];
const cursorStyles: string[] = [];
const nvimCursorStyle = document.getElementById("nvim_cursor_style");
const nvimHighlightStyle = document.getElementById("nvim_highlight_style");

const redrawFuncs = {
    default_colors_set: (elem: HTMLElement,
                         selector: string,
                         [fg, bg, sp, _, __]: [number, number, number, number, number]) => {
        if (fg !== undefined && fg !== -1) {
            defaultColors.foreground = fg;
            highlights[0].foreground = toHexCss(defaultColors.foreground);
        }
        if (bg !== undefined && bg !== -1) {
            defaultColors.background = bg;
            highlights[0].background = toHexCss(defaultColors.background);
        }
        nvimHighlightStyle.innerText = toCss(highlights);
    },
    flush: (elem: HTMLElement) => nvimHighlightStyle.innerText = toCss(highlights),
    grid_clear: (elem: HTMLElement, selector: string, [id]: [number]) => grids[id].clear(),
    grid_cursor_goto: (elem: HTMLElement, selector: string, [id, y, x]: GotoUpdate) => grids[id].cursor_goto(x, y),
    grid_line: (elem: HTMLElement, selector: string, [id, row, col, contents]: LineUpdate) =>
    contents.reduce(({ prevCol, highlight }, content) => {
        const [chara, high = highlight, repeat = 1] = content;
        const limit = prevCol + repeat;
        for (let i = prevCol; i < limit; i += 1) {
            grids[id].get(row).get(i).value = chara;
            grids[id].get(row).get(i).highlight = high;
        }
        return { prevCol: limit, highlight: high };
    }, { prevCol: col, highlight: 0 }),
    grid_resize: (elem: HTMLElement, selector: string, resize: ResizeUpdate) => {
        const [id, width, height] = resize;
        if (grids[id] !== undefined) {
            grids[id].resize(width, height);
        } else {
            grids[id] = new Grid(width, height);
            grids[id].attach(elem);
        }
        const [cellWidth, cellHeight] = getCharSize(elem);
        page.resizeEditor(selector, width * cellWidth, height * cellHeight);
    },
    grid_scroll: (elem: HTMLElement,
                  selector: string,
                  [id, ...rest]: [number, number, number, number, number, number, number]) => {
        grids[id].scroll(...rest);
    },
    hl_attr_define: (elem: HTMLElement, selector: string, [id, { foreground, background }]: HighlightUpdate) => {
        if (highlights[id] === undefined) {
            highlights[id] = { background: undefined, foreground: undefined };
        }
        highlights[id].foreground = foreground ? toHexCss(foreground) : undefined;
        highlights[id].background = background ? toHexCss(background) : undefined;
    },
    mode_change: (elem: HTMLElement, selector: string, [modename, modeid]: [string, number]) => {
        const modePrefix = "nvim_mode_";
        Array.from(elem.classList)
            .filter((cname: string) => cname.startsWith(modePrefix))
            .forEach((cname: string) => elem.classList.remove(cname));
        elem.classList.add(modePrefix + modename);
        nvimCursorStyle.innerText = cursorStyles[modeid];
    },
    mode_info_set: (elem: HTMLElement, selector: string, [cursorStyleEnabled, modeInfo]: [boolean, any]) => {
        if (cursorStyleEnabled) {
            modeInfo.forEach((info: any, idx: number) => {
                const { cursor_shape: shape } = info;
                let cssStr = `html body span.nvim_cursor { `;
                switch (shape) {
                    case "vertical":
                        cssStr += `box-sizing: border-box;`;
                        cssStr += `border-left: solid 1px ${highlights[0].foreground};`;
                        break;
                    case "horizontal":
                        cssStr += `box-sizing: border-box;`;
                        cssStr += `border-bottom: solid 1px ${highlights[0].foreground};`;
                        break;
                    case "block":
                        cssStr += `background: ${highlights[0].foreground};`;
                        cssStr += `color: ${highlights[0].background};`;
                        break;
                    default:
                        console.log(`Unhandled cursor shape: ${shape}`);
                }
                cssStr += "}";
                cursorStyles[idx] = cssStr;
            });
        }
    },
};

export function onRedraw(events: any[], elem: HTMLPreElement, selector: string) {
    events.forEach(evt => {
        const [name, ...evts]: [keyof typeof redrawFuncs, any] = evt;
        if (redrawFuncs[name] !== undefined) {
            evts.forEach((args) => redrawFuncs[name](elem, selector, args));
        } else {
            console.log(`Unhandled redraw event: ${name}.`);
        }
    });
}
