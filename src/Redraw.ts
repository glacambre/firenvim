import { toCss, toHexCss } from "./CSSUtils";
import { new_grid } from "./Grid";

export function onRedraw(events: any[], elem: HTMLPreElement, grids: any[], highlights: HighlightArray) {
    events.forEach(evt => {
        const [name, ...evts] = evt;
        switch (name) {
            case "option_set":
                // console.log("option_set:", evts);
                break;
            case "hl_attr_define":
                evts.forEach((highlight: HighlightUpdate) => {
                    const [id, { foreground, background }] = highlight;
                    highlights[id] = {
                        background: toHexCss(background || 16777215),
                        foreground: toHexCss(foreground || 0),
                    };
                });
                break;
            case "default_colors_set":
                const [[fg, bg, sp, _, __]] = evts;
                highlights[0] = {
                    background: toHexCss(bg),
                    foreground: toHexCss(fg),
                };
                const styleElem = document.getElementById("neovim_highlights");
                if (styleElem) {
                    styleElem.innerText = toCss(highlights);
                }
                break;
            case "grid_resize":
                evts.forEach((resize: ResizeUpdate) => {
                    const [id, width, height] = resize;
                    grids[id] = new_grid(width, height, elem);
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
                            grids[id][row][i] = chara;
                            grids[id][row][i].highlight = high;
                        }
                        return limit;
                    }, col);
                });
                break;
            case "mode_info_set":
                // console.log("mode_info_set:", evts);
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
    // console.log(grids, highlights);
}
