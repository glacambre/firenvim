import { page } from "../page/proxy";
import { parseGuifont, toCss, toHexCss } from "../utils/CSSUtils";

let functions;
export function setFunctions(fns: any) {
    functions = fns;
}

let metricsInvalidated: boolean = false;
let glyphCache : any = {};

let canvas : HTMLCanvasElement;
let context : CanvasRenderingContext2D;
let fontString : string;
function setFontString (s : string) {
    fontString = s;
    context.font = fontString;
    metricsInvalidated = true;
    glyphCache = {};
}
export function setCanvas (cvs: HTMLCanvasElement) {
    canvas = cvs;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    const { fontFamily, fontSize } = window.getComputedStyle(canvas);
    fontString = `${fontSize} ${fontFamily}`;
    context = canvas.getContext("2d", { "alpha": false });
    setFontString(fontString);
}


// We first define highlight information.
const defaultBackground = "#FFFFFF";
const defaultForeground = "#000000";
type HighlightInfo = {
    background: string,
    bold: boolean,
    blend: number,
    foreground: string,
    italic: boolean,
    reverse: boolean,
    special: string,
    strikethrough: boolean,
    undercurl: boolean,
    underline: boolean
};

// We then have a GridSize type. We need this type in order to keep track of
// the size of grids. Storing this information here can appear redundant since
// the grids are represented as arrays and thus have a .length attribute, but
// it's not: storing grid size in a separate datastructure allows us to never
// have to shrink arrays, and to not need allocations if enlarging an array
// that has been shrinked.
type GridDimensions = {
    width: number,
    height: number,
}

enum DamageKind {
    Cell,
    Resize,
    Scroll,
};

// Used to track rectangles of damage done to a grid and only repaint the
// necessary bits. These are logic positions (i.e. cells) - not pixels.
type CellDamage = {
    kind: DamageKind,
    // The number of rows the damage spans
    h: number,
    // The number of columns the damage spans
    w: number,
    // The column the damage begins at
    x: number,
    // The row the damage begins at
    y: number,
};

type ResizeDamage = {
    kind: DamageKind,
    // The new height of the canvas
    h: number,
    // The new width of the canvas
    w: number,
    // The previous width of the canvas
    x: number,
    // The previous height of the canvas
    y: number,
};

type ScrollDamage = {
    kind: DamageKind,
    // The direction of the scroll, -1 means up, 1 means down
    h: number,
    // The number of lines of the scroll, positive number
    w: number,
    // The top line of the scrolling region, in cells
    x: number,
    // The bottom line of the scrolling region, in cells
    y: number,
}

type GridDamage = CellDamage & ResizeDamage & ScrollDamage;

// The state of the commandline. It is only used when using neovim's external
// commandline.
type CommandLineState = "hidden" | "shown";

type State = {
    commandLine : CommandLineState,
    defaultBackground: string,
    defaultForeground: string,
    defaultSpecial: number,
    gridCharacters: string[][][],
    gridDamages: GridDamage[][],
    gridHighlights: number[][][],
    gridSizes: GridDimensions[],
    highlights: HighlightInfo[],
    isBusy: boolean,
};

const globalState: State = {
    commandLine: "hidden",
    defaultBackground,
    defaultForeground,
    defaultSpecial: 0,
    gridCharacters: [],
    gridHighlights: [],
    gridDamages: [],
    gridSizes: [],
    highlights: [newHighlight(defaultBackground, defaultForeground)],
    isBusy : false,
};

let maxCellWidth: number;
let maxCellHeight: number;
let maxBaselineDistance: number;
function recomputeCharSize (context: CanvasRenderingContext2D) {
    // 94, K+32: we ignore the first 32 ascii chars because they're non-printable
    const chars = new Array(94)
        .fill(0)
        .map((_, k) => String.fromCharCode(k + 32))
        // Concatening Â because that's the tallest character I can think of.
        .concat(["Â"]);
    let width = 0;
    let height = 0;
    let baseline = 0;
    let measure: TextMetrics;
    for (const char of chars) {
        measure = context.measureText(char);
        if (measure.width > width) {
            width = measure.width;
        }
        let tmp = Math.abs(measure.actualBoundingBoxAscent);
        if (tmp > baseline) {
            baseline = tmp;
        }
        tmp += Math.abs(measure.actualBoundingBoxDescent);
        if (tmp > height) {
            height = tmp;
        }
    }
    maxCellWidth = Math.ceil(width);
    maxCellHeight = Math.ceil(height);
    maxBaselineDistance = baseline;
    metricsInvalidated = false;
}
function getGlyphInfo () {
    if (metricsInvalidated
        || maxCellWidth === undefined
        || maxCellHeight === undefined
        || maxBaselineDistance === undefined) {
        recomputeCharSize(context);
    }
    return [maxCellWidth, maxCellHeight, maxBaselineDistance];
}

function newHighlight (bg: string, fg: string): HighlightInfo {
    return {
        background: bg,
        bold: undefined,
        blend: undefined,
        foreground: fg,
        italic: undefined,
        reverse: undefined,
        special: undefined,
        strikethrough: undefined,
        undercurl: undefined,
        underline: undefined,
    };
}

let windowId: number;
export function selectWindow(wid: number) {
    if (windowId !== undefined) {
        return;
    }
    windowId = wid;
}
export function getWindowId() {
    return windowId;
}
function matchesSelectedWindow(wid: number) {
    return windowId === undefined || windowId === wid;
}

let gridId: number;
function selectGrid(gid: number) {
    if (gridId !== undefined) {
        return;
    }
    gridId = gid;
}

export function getGridId() {
    return gridId !== undefined ? gridId : 1;
}

function matchesSelectedGrid(gid: number) {
    return gridId === undefined || gridId === gid;
}

const handlers = {
    busy_start: (state: State) => { state.isBusy = true; },
    busy_stop: (state: State) => { state.isBusy = false; },
    cmdline_hide: (state: State) => { state.commandLine = "hidden"; },
    cmdline_pos: (_: State) => { },
    cmdline_show: (state: State) => { state.commandLine = "shown"; },
    default_colors_set: (state: State, fg: number, bg: number, sp: number) => {
        if (fg !== undefined && fg !== -1) {
            state.defaultForeground = toHexCss(fg);
        }
        if (bg !== undefined && bg !== -1) {
            state.defaultBackground = toHexCss(bg);
        }
        if (sp !== undefined && sp !== -1) {
            state.defaultSpecial = sp;
        }
    },
    flush: (_: State) => { },
    grid_clear: (_: State, id: number) => {
        if (!matchesSelectedGrid(id)) {
            return;
        }
    },
    grid_cursor_goto: (_: State, id: number) => {
        if (!matchesSelectedGrid(id)) {
            return;
        }
    },
    grid_line: (state: State, id: number, row: number, col: number, changes:  any[]) => {
        if (!matchesSelectedGrid(id)) {
            return;
        }
        const charGrid = state.gridCharacters[id];
        const damages = state.gridDamages[id];
        const highlights = state.gridHighlights[id];
        let prevCol = col, high = 0;
        for (let change of changes) {
            const chara = change[0];
            if (change[1] !== undefined) {
                high = change[1]
            }
            const repeat = change[2] === undefined ? 1 : change[2];

            damages.push({
                kind: DamageKind.Cell,
                y: row,
                h: 1,
                x: prevCol,
                w: repeat
            });

            const limit = prevCol + repeat;
            for (let i = prevCol; i < limit; i += 1) {
                charGrid[row][i] = chara;
                highlights[row][i] = high;
            }
            prevCol = limit;
        }
    },
    grid_resize: (state: State, id: number, width: number, height: number) => {
        if (!matchesSelectedGrid(id)) {
            return;
        }
        const createGrid = state.gridCharacters[id] === undefined
        if (createGrid) {
            state.gridCharacters[id] = new Array();
            state.gridCharacters[id].push((new Array(1)).fill(" "));
            state.gridSizes[id] = { width: 0, height: 0 };
            state.gridDamages[id] = new Array();
            state.gridHighlights[id] = new Array();
            state.gridHighlights[id].push((new Array(1)).fill(0));
        }

        const curGridSize = state.gridSizes[id];
        const damages = state.gridDamages[id];

        // When not creating a new grid, we need to save the drawing context we
        // have on canvas resize.
        if (!createGrid) {
            damages.push({
                kind: DamageKind.Resize,
                h: height,
                w: width,
                x: curGridSize.width,
                y: curGridSize.height,
            });
        }

        const highlights = state.gridHighlights[id];
        const charGrid = state.gridCharacters[id];
        if (width > charGrid[0].length) {
            for (let i = 0; i < charGrid.length; ++i) {
                let row = charGrid[i];
                let highs = highlights[i];
                while (row.length < width) {
                    row.push(" ");
                    highs.push(0);
                }
            }
        }
        if (width > curGridSize.width) {
            damages.push({
                kind: DamageKind.Cell,
                h: curGridSize.height,
                w: width - curGridSize.width,
                x: curGridSize.width,
                y: 0,
            });
        }
        if (height > charGrid.length) {
            while (charGrid.length < height) {
                charGrid.push((new Array(width)).fill(" "));
                highlights.push((new Array(width)).fill(0));
            }
        }
        if (height > curGridSize.height) {
            damages.push({
                kind: DamageKind.Cell,
                h: height - curGridSize.height,
                w: width,
                x: 0,
                y: curGridSize.height,
            });
        }
        curGridSize.width = width;
        curGridSize.height = height;
    },
    grid_scroll: (state: State,
                  id: number,
                  top: number,
                  bot: number,
                  left: number,
                  right: number,
                  rows: number,
                  cols: number) => {
        if (!matchesSelectedGrid(id)) {
            return;
        }
        const dimensions = state.gridSizes[id];
        const charGrid = state.gridCharacters[id];
        const highGrid = state.gridHighlights[id];
        const damages = state.gridDamages[id];
        if (rows > 0) {
            let bottom = (bot + rows) >= dimensions.height
                ? dimensions.height - rows
                : bot + rows;
            for (let y = top; y < bottom; ++y) {
                const src_chars = charGrid[y + rows];
                const dst_chars = charGrid[y];
                const src_highs = highGrid[y + rows];
                const dst_highs = highGrid[y];
                for (let x = 0; x < dimensions.width; ++x) {
                    dst_chars[x] = src_chars[x];
                    dst_highs[x] = src_highs[x];
                }
            }
            damages.push({
                kind: DamageKind.Cell,
                x : 0,
                y: 0,
                w: dimensions.width,
                h: dimensions.height,
            });
        } else if (rows < 0) {
            for (let y = bot - 1; y >= top; --y) {
                const src_chars = charGrid[y + rows];
                const dst_chars = charGrid[y];
                const src_highs = highGrid[y + rows];
                const dst_highs = highGrid[y];
                for (let x = 0; x < dimensions.width; ++x) {
                    dst_chars[x] = src_chars[x];
                    dst_highs[x] = src_highs[x];
                }
            }
            damages.push({
                kind: DamageKind.Cell,
                x : 0,
                y: 0,
                w: dimensions.width,
                h: dimensions.height
            });
        }
    },
    hl_attr_define: (state: State, id: number, rgb_attr: any) => {
        const highlights = state.highlights;
        if (highlights[id] === undefined) {
            highlights[id] = newHighlight(undefined, undefined);
        }
        highlights[id].foreground = toHexCss(rgb_attr.foreground);
        highlights[id].background = toHexCss(rgb_attr.background);
        highlights[id].bold = rgb_attr.bold;
        highlights[id].blend = rgb_attr.blend;
        highlights[id].italic = rgb_attr.italic;
        highlights[id].special = toHexCss(rgb_attr.special);
        highlights[id].strikethrough = rgb_attr.strikethrough;
        highlights[id].undercurl = rgb_attr.undercurl;
        highlights[id].underline = rgb_attr.underline;
        highlights[id].reverse = rgb_attr.reverse;
    },
    mode_change: (): undefined => undefined,
    mode_info_set: (): undefined => undefined,
    msg_clear: (): undefined => undefined,
    msg_history_show: (): undefined => undefined,
    msg_show: (): undefined => undefined,
    option_set: (_: State, option: string, value: any) => {
        console.log(option, value);
        switch (option) {
            case "guifont":
                const guifont = parseGuifont(value || "monospace:h9", {});
                setFontString((guifont["font-size"] || "") + " " + (guifont["font-family"] || "monospace"));
                const [charWidth, charHeight] = getGlyphInfo();
                functions.ui_try_resize_grid(getGridId(),
                                             Math.floor(canvas.width / charWidth),
                                             Math.floor(canvas.height / charHeight));
        }
    },
    win_external_pos: (_: State, [grid, win]: number[]) => {
        if (windowId !== undefined && matchesSelectedWindow(win)) {
            selectGrid(grid);
        }
    },
};

// keep track of wheter a frame is already being scheduled or not. This avoids
// asking for multiple frames where we'd paint the same thing anyway.
let frameScheduled = false;
function paint (_: DOMHighResTimeStamp) {
    frameScheduled = false;

    const state = globalState;
    const gid = getGridId();
    const charactersGrid = state.gridCharacters[gid];
    const highlightsGrid = state.gridHighlights[gid];
    const damages = state.gridDamages[gid];
    const highlights = state.highlights;
    const [charWidth, charHeight, baseline] = getGlyphInfo();

    for (let i = 0; i < damages.length; ++i) {
        const damage = damages[i];
        switch (damage.kind) {
            case DamageKind.Resize: {
                // Get smallest width between old width and new width
                const width = damage.w > damage.x ? damage.x : damage.w;
                // Get smallest height between old height and new height
                const height = damage.h > damage.y ? damage.y : damage.h;
                // Save the canvas, which will be lost on resize
                const data = context.getImageData(0, 0, width * charWidth, height * charHeight);

                const pixelWidth = damage.w * charWidth;
                const pixelHeight = damage.h * charHeight;
                page.resizeEditor(pixelWidth, pixelHeight);
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
                // Note: changing width and height resets font, so we have to
                // set it again. Who thought this was a good idea???
                context.font = fontString;

                // Restore the canvas
                context.putImageData(data, 0, 0);
            };
            break;
            case DamageKind.Scroll:
            case DamageKind.Cell:
                for (let y = damage.y; y < damage.y + damage.h; ++y) {
                    const row = charactersGrid[y];
                    const highs = highlightsGrid[y];
                    const pixelY = y * charHeight;

                    for (let x = damage.x; x < damage.x + damage.w; ++x) {
                        const pixelX = x * charWidth;
                        let glyphId = row[x] + "-" + highs[x];

                        if (glyphCache[glyphId] === undefined) {
                            context.fillStyle = highlights[highs[x]].background || state.defaultBackground;
                            context.fillRect(pixelX,
                                             pixelY,
                                             charWidth,
                                             charHeight);
                            context.fillStyle = highlights[highs[x]].foreground || state.defaultForeground;
                            context.fillText(row[x], pixelX, pixelY + baseline);
                            glyphCache[glyphId] = context.getImageData(
                                pixelX,
                                pixelY,
                                charWidth,
                                charHeight,
                            );
                        } else {
                            context.putImageData(glyphCache[glyphId], pixelX, pixelY);
                        }
                    }
                }
                break;
        }
    }

    damages.length = 0;
}

export function onRedraw(events: any[]) {
    for (let event of events) {
        const handler = (handlers as any)[(event[0] as any)];
        if (handler !== undefined) {
            for (let i = 1; i < event.length; ++i) {
                handler(globalState, ...event[i]);
            }
        }
    }
    if (!frameScheduled) {
        frameScheduled = true;
        window.requestAnimationFrame(paint);
    }
}
