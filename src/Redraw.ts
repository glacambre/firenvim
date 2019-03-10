import { toCss, toHexCss } from "./CSSUtils";
import { Grid } from "./Grid";

const defaultColors = { background: 16777215, foreground: 0 };

export function onRedraw(events: any[], elem: HTMLPreElement, grids: Grid[], highlights: HighlightArray) {
    events.forEach(evt => {
        const [name, ...evts] = evt;
        switch (name) {
            case "hl_attr_define":
                evts.forEach((highlight: HighlightUpdate) => {
                    const [id, { foreground, background }] = highlight;
                    highlights[id] = {
                        background: toHexCss(background && background >= 0 ? background : defaultColors.background),
                        foreground: toHexCss(foreground && foreground >= 0 ? foreground : defaultColors.foreground),
                    };
                });
                break;
            case "default_colors_set":
                const [] = evts;
                evts.forEach(([fg, bg, sp, _, __]: [number, number, number, number, number]) => {
                    defaultColors.background = bg;
                    defaultColors.foreground = fg;
                    highlights[0] = {
                        background: toHexCss(defaultColors.background),
                        foreground: toHexCss(defaultColors.foreground),
                    };
                });
                const styleElem = document.getElementById("neovim_highlights");
                if (styleElem) {
                    styleElem.innerText = toCss(highlights);
                }
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
            case "grid_clear":
                evts.forEach(([id]: [number]) => grids[id].clear());
                break;
            case "grid_cursor_goto":
                // console.log("cursor_goto:", evt);
                evts.forEach(([id, x, y]: GotoUpdate) => grids[id].cursor_goto(y, x) );
                break;
            case "grid_line":
                evts.forEach((line: LineUpdate) => {
                    const [id, row, col, contents] = line;
                    contents.reduce((prevCol, content) => {
                        const [chara, high = 0, repeat = 1] = content;
                        const limit = prevCol + repeat;
                        for (let i = prevCol; i < limit; i += 1) {
                            grids[id].get(row).get(i).value = chara;
                            grids[id].get(row).get(i).highlight = high;
                        }
                        return limit;
                    }, col);
                });
                break;
            case "mode_change":
                evts.forEach(([modename, modeid]: [string, number]) => {
                    const modePrefix = "nvim_mode_";
                    Array.prototype.filter
                        .call(elem.classList, (cname: string) => cname.startsWith(modePrefix))
                        .forEach((cname: string) => elem.classList.remove(cname));
                    elem.classList.add(modePrefix + modename);
                });
                break;
            case "flush":
                const style = document.getElementById("neovim_highlights");
                if (style) {
                    style.innerText = toCss(highlights);
                }
                break;
            default:
                console.log("Unhandled evt:", evt);
                break;
        }
    });
}
