import { toCss, toHexCss } from "./CSSUtils";
import { Grid } from "./Grid";

const defaultColors = { background: 16777215, foreground: 0 };
const grids: Grid[] = [];
const highlights: HighlightArray = [{ background: "#FFFFFF", foreground: "#000000" }];
const cursorStyles: string[] = [];
const nvimCursorStyle = document.getElementById("nvim_cursor_style");
const nvimHighlightStyle = document.getElementById("nvim_highlight_style");

export function onRedraw(events: any[], elem: HTMLPreElement) {
    events.forEach(evt => {
        const [name, ...evts] = evt;
        switch (name) {
            case "default_colors_set":
                const [] = evts;
                evts.forEach(([fg, bg, sp, _, __]: [number, number, number, number, number]) => {
                    if (fg !== undefined && fg !== -1) {
                        defaultColors.foreground = fg;
                        highlights[0].foreground = toHexCss(defaultColors.foreground);
                    }
                    if (bg !== undefined && bg !== -1) {
                        defaultColors.background = bg;
                        highlights[0].background = toHexCss(defaultColors.background);
                    }
                });
                nvimHighlightStyle.innerText = toCss(highlights);
                break;
            case "hl_attr_define":
                evts.forEach(([id, { foreground, background }]: HighlightUpdate) => {
                    if (highlights[id] === undefined) {
                        highlights[id] = { background: undefined, foreground: undefined };
                    }
                    highlights[id].foreground = foreground ? toHexCss(foreground) : undefined;
                    highlights[id].background = background ? toHexCss(background) : undefined;
                });
                break;
            case "grid_clear":
                evts.forEach(([id]: [number]) => grids[id].clear());
                break;
            case "grid_cursor_goto":
                evts.forEach(([id, x, y]: GotoUpdate) => grids[id].cursor_goto(y, x) );
                break;
            case "grid_line":
                evts.forEach(([id, row, col, contents]: LineUpdate) =>
                    contents.reduce((prevCol, content) => {
                        const [chara, high = 0, repeat = 1] = content;
                        const limit = prevCol + repeat;
                        for (let i = prevCol; i < limit; i += 1) {
                            grids[id].get(row).get(i).value = chara;
                            grids[id].get(row).get(i).highlight = high;
                        }
                        return limit;
                    }, col));
                break;
            case "grid_resize":
                evts.forEach((resize: ResizeUpdate) => {
                    const [id, width, height] = resize;
                    if (grids[id]) {
                        grids[id].detach();
                    }
                    grids[id] = new Grid(width, height);
                    grids[id].attach(elem);
                });
                break;
            case "grid_scroll":
                evts.forEach(([id, ...rest]: [number, number, number, number, number, number, number]) => {
                    grids[id].scroll(...rest);
                });
                break;
            case "mode_change":
                evts.forEach(([modename, modeid]: [string, number]) => {
                    const modePrefix = "nvim_mode_";
                    Array.prototype.filter
                        .call(elem.classList, (cname: string) => cname.startsWith(modePrefix))
                        .forEach((cname: string) => elem.classList.remove(cname));
                    elem.classList.add(modePrefix + modename);
                    nvimCursorStyle.innerText = cursorStyles[modeid];
                });
                break;
            case "mode_info_set":
                evts.forEach(([cursorStyleEnabled, modeInfo]: [boolean, any]) => {
                    if (cursorStyleEnabled) {
                        modeInfo.forEach((info: any, idx: number) => {
                            const { cursor_shape: shape, attr_id: attrId } = info;
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
                                    break;
                            }
                            cssStr += "}";
                            cursorStyles[idx] = cssStr;
                        });
                    }
                });
                break;
            case "flush":
                nvimHighlightStyle.innerText = toCss(highlights);
                break;
            default:
                console.log("Unhandled redraw request:", evt);
                break;
        }
    });
}
