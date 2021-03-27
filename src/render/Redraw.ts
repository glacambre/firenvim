import { NvimMode } from "../utils/configuration";
import { page } from "../page/proxy";
import { parseGuifont, toHexCss } from "../utils/utils";
import { Grid } from "./Grid";

// Returns a number tuple representing the size of characters in the host
export function getCharSize(host: HTMLElement) {
    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.top = "0px";
    span.style.left = "0px";
    span.innerText = " ";
    host.appendChild(span);
    const { width, height } = span.getBoundingClientRect();
    host.removeChild(span);
    return [width, height];
}

// Returns a number tuple representing how many columns and rows can fit in the
// host.
export function getGridSize(host: HTMLElement) {
    const rect = host.getBoundingClientRect();
    const [width, height] = getCharSize(host);
    return [Math.floor(rect.width / width), Math.floor(rect.height / height)];
}



// Takes a `guifont` declaration and returns that same font declaration but as
// a bunch of CSS declarations.
export function guifontToMultiDecl(guifont: string) {
    const defaults: any = {};
    defaults["font-family"] = "Monospace";
    defaults["font-size"] = "9pt";
    return Object.entries(parseGuifont(guifont, defaults))
        .map(([key, value]) => `${key}: ${value};\n`)
        .join("\n");
}
// Takes an array of `guifont` declarations and returns them as a single CSS
// declaration, using font-family for font fallback.
export function guifontsToFontFamily(guifonts: string[]) {
    const defaults: any = {};
    defaults["font-family"] = "Monospace";
    defaults["font-size"] = "9pt";
    const reducedGuifonts = guifonts
        .slice()
        .reverse()
        .reduce((acc, cur) => parseGuifont(cur, acc), defaults);
    return `font-family: ${reducedGuifonts["font-family"]}; font-size: ${reducedGuifonts["font-size"]};`;
}
// Takes a string formatted according to the `guifont` spec and returns a CSS
// declaration that matches it.
export function guifontsToCSS(guifont: string) {
    const guifonts = (guifont + ",")
        .match(/.+?[^\\],/g) // split on non-escaped commas
        .map(s => s.slice(0, -1)); // remove last comma of each font
    if (guifonts.length > 1) {
        // If there are multiple font declarations, we use a CSS declaration
        // like this: `font-family: font-family1 font-size font-style
        // font-weight, font-family2...`. This prevents us from setting
        // size/bold/italics/underlnie/strikethrough but enables letting the
        // browser fallback to other fonts if one can't be found.
        return guifontsToFontFamily(guifonts);
    }
    return guifontToMultiDecl(guifonts[0]);
}

export function toHighlightClassName(n: number) {
    return "nvim_highlight_" + n;
}

// Computes a CSS stylesheet that represents the HighlightArray
export function toCss(highs: HighlightArray) {
    const bg = highs[0].background;
    const fg = highs[0].foreground;
    return highs.reduce((css, elem, id) => css +
        `.${toHighlightClassName(id)}{background: ${elem.background || bg};color:${elem.foreground || fg};font-style:${elem.italic ? "italic" : "normal"};font-weight:${elem.bold ? "bold" : "normal"};text-decoration-line:${(elem.undercurl || elem.underline) ? "underline" : (elem.strikethrough ? "line-through" : "none")};text-decoration-style:${elem.undercurl ? "wavy" : "solid"};}`
        , "");
}

const defaultColors = { background: 16777215, foreground: 0 };
const grids: Grid[] = [];
const highlights: HighlightArray = [{ background: "#FFFFFF", foreground: "#000000" }];
const cursorStyles: string[] = [];
const nvimCursorStyle = document.getElementById("nvim_cursor_style");
const nvimHighlightStyle = document.getElementById("nvim_highlight_style");
const nvimLinespace = document.getElementById("nvim_linespace");
const nvimGuifont = document.getElementById("nvim_guifont");
const mouseCursor = document.getElementById("mouse_cursor");

let cmdlineCursorPos = 0;

let historyShown = false;
let externalMessages: any;
export function onKeyPressed(_key: string) {
   if (historyShown) {
      externalMessages.style.display = "none";
      historyShown = false;
   }
}
function getGrid(id: number, elem: HTMLElement) {
   if (grids[id] === undefined) {
      const lastGrid = grids[grids.length - 1] || { width: 0, height: 0 };
      grids[id] = new Grid(lastGrid.width, lastGrid.height);
      grids[id].attach(elem);
   }
   return grids[id];
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
   grids.forEach((grid, i) => {
      if (i !== gridId) {
         grid.detach();
      }
   });
}

export function getGridId() {
   return gridId !== undefined ? gridId : 1;
}

function matchesSelectedGrid(gid: number) {
   return gridId === undefined || gridId === gid;
}

let currentMode : NvimMode = "normal";
export function getCurrentMode() {
   return currentMode;
}

const redrawFuncs = {
   busy_start: () => {
      mouseCursor.innerText = `html { cursor: wait; }`;
   },
   busy_stop: () => {
      mouseCursor.innerText = `html { cursor: default; }`;
   },
   cmdline_hide: (_: any,
                  ___: any,
                  ____: any,
                  extCmdline: HTMLPreElement) => {
         extCmdline.style.display = "none";
   },
   cmdline_pos: (_: any,
                 [pos, _level]: [number, number],
                 ____: any,
                 extCmdline: HTMLPreElement) => {
         if (extCmdline.children[cmdlineCursorPos]) {
            extCmdline.children[cmdlineCursorPos].className = "";
         }
         cmdlineCursorPos = pos;
         extCmdline.children[cmdlineCursorPos].className = "nvim_cursor";
   },
   cmdline_show: (_: any,
                  [content, pos, firstc, _prompt, _indent, _level]: any,
                  ___: any,
                  extCmdline: HTMLPreElement) => {
         Array.from(extCmdline.childNodes).forEach(n => n.parentNode.removeChild(n));
         extCmdline.appendChild(document.createTextNode(firstc));
         content.forEach(([attr, chars]: [number, string]) => {
            chars.split("").forEach(char => {
               const span = document.createElement("span");
               span.className = "nvim_attr_" + attr;
               span.innerText = char;
               extCmdline.appendChild(span);
            });
         });
         const extra = document.createElement("span");
         extra.innerHTML = " ";
         extCmdline.appendChild(extra);
         if (extCmdline.children[cmdlineCursorPos]) {
            extCmdline.children[cmdlineCursorPos].className = "";
         }
         cmdlineCursorPos = pos;
         extCmdline.children[cmdlineCursorPos].className = "nvim_cursor";
         extCmdline.style.display = "block";
         const rect = extCmdline.getBoundingClientRect();
         extCmdline.style.top = ((window.innerHeight - rect.height) / 2) + "px";
         extCmdline.style.left = ((window.innerWidth - rect.width) / 2) + "px";
   },
   default_colors_set: (elem: HTMLElement,
                        [fg, bg, _sp, _, __]: [number, number, number, number, number]) => {
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
   flush: () => nvimHighlightStyle.innerText = toCss(highlights),
   grid_clear: (elem: HTMLElement, [id]: [number]) => {
      if (!matchesSelectedGrid(id)) {
         return;
      }
      getGrid(id, elem).clear();
   },
   grid_cursor_goto: (elem: HTMLElement, [id, y, x]: GotoUpdate) => {
      if (!matchesSelectedGrid(id)) {
         return;
      }
      getGrid(id, elem).cursor_goto(x, y);
      setTimeout(() => {
         const keyHandler = document.getElementById("keyhandler");
         const [cellWidth, cellHeight] = getCharSize(elem);
         keyHandler.style.left = `${cellWidth * x}px`;
         keyHandler.style.top = `${cellHeight * y}px`;
      });
   },
   grid_line: (elem: HTMLElement, [id, row, col, contents]: LineUpdate) => {
      if (!matchesSelectedGrid(id)) {
         return;
      }
      contents.reduce(({ prevCol, highlight }, content) => {
         const [chara, high = highlight, repeat = 1] = content;
         const limit = prevCol + repeat;
         for (let i = prevCol; i < limit; i += 1) {
            getGrid(id, elem).get(row).get(i).value = chara;
            getGrid(id, elem).get(row).get(i).highlight = high;
         }
         return { prevCol: limit, highlight: high };
      }, { prevCol: col, highlight: 0 });
   },
   grid_resize: (elem: HTMLElement, resize: ResizeUpdate) => {
      const [id, width, height] = resize;
      if (!matchesSelectedGrid(id)) {
         return;
      }
      getGrid(id, elem).resize(width, height);
      const [cellWidth, cellHeight] = getCharSize(elem);
      page.resizeEditor(width * cellWidth, height * cellHeight);
   },
   grid_scroll: (elem: HTMLElement,
                 [id, ...rest]: [number, number, number, number, number, number, number]) => {
      if (!matchesSelectedGrid(id)) {
         return;
      }
      getGrid(id, elem).scroll(...rest);
   },
   hl_attr_define: (elem: HTMLElement, [id, {
      background,
      bold,
      foreground,
      italic,
      reverse,
      special,
      strikethrough,
      undercurl,
      underline,
   }]: HighlightUpdate) => {
      if (highlights[id] === undefined) {
         highlights[id] = { background: undefined, foreground: undefined };
      }
      let f = foreground !== undefined ? toHexCss(foreground) : undefined;
      let b = background !== undefined ? toHexCss(background) : undefined;
      if (reverse) {
         const tmp = f;
         f = b;
         b = tmp;
      }
      highlights[id].foreground = f;
      highlights[id].background = b;
      highlights[id].bold = bold;
      highlights[id].italic = italic;
      highlights[id].special = special;
      highlights[id].strikethrough = strikethrough;
      highlights[id].undercurl = undercurl;
      highlights[id].underline = underline;
   },
   mode_change: (elem: HTMLElement, [modename, modeid]: [NvimMode, number]) => {
      currentMode = modename;
      const modePrefix = "nvim_mode_";
      Array.from(elem.classList)
         .filter((cname: string) => cname.startsWith(modePrefix))
         .forEach((cname: string) => elem.classList.remove(cname));
      elem.classList.add(modePrefix + modename);
      nvimCursorStyle.innerText = cursorStyles[modeid];
   },
   mode_info_set: (elem: HTMLElement, [_, modeInfo]: [boolean, any]) => {
      modeInfo.forEach((info: any, idx: number) => {
         const shape = info.cursor_shape;
         let attr_id = info.attr_id;
         if (attr_id === undefined) {
            attr_id = 0;
         }
         let foreground = highlights[attr_id].foreground;
         let background = highlights[attr_id].background;
         if (attr_id === 0) {
            const tmp = foreground;
            foreground = background;
            background = tmp;
         }
         let cssStr = `html body span.nvim_cursor { `;
         switch (shape) {
               case "vertical":
                  cssStr += `box-sizing: border-box;`;
                  cssStr += `border-left: solid 1px ${background};`;
                  break;
               case "horizontal":
                  cssStr += `box-sizing: border-box;`;
                  cssStr += `border-bottom: solid 1px ${background};`;
                  break;
               case "block":
                  cssStr += `color: ${foreground};`;
                  cssStr += `background: ${background};`;
                  break;
            }
         cssStr += "}";
         cursorStyles[idx] = cssStr;
         });
   },
   msg_clear: (_: any,
               ___: any,
               ____: any,
               _____: any,
               extMessages: HTMLSpanElement) => {
         extMessages.style.display = "none";
         extMessages.innerText = "";
   },
   msg_history_show: (_: any,
                      entries: any,
                      ____: any,
                      _____: any,
                      extMessages: HTMLSpanElement) => {
         extMessages.innerText = entries
                  .map((entry: any) => entry
                       .map((message: any) => message[1]
                            .map((info: any) => info[1])
                            .join(""))
                       .join("\n"))
                  .join("\n");
         extMessages.style.display = "block";
         historyShown = true;
   },
   msg_show: (_: any,
              [_kind, content, replaceLast]: [string, [number, string][], boolean],
              ___: any,
              ____: any,
              extMessages: HTMLSpanElement) => {
         const msg = content
            .map(([_, chars]: [number, string]) => chars)
            .join("");
         if (replaceLast) {
            extMessages.innerText = msg;
         } else {
            if (extMessages.innerText !== "") {
               extMessages.innerText += "\n";
            }
            extMessages.innerText += msg;
         }
         extMessages.style.display = "block";
   },
   option_set: (elem: HTMLElement,
                [name, value]: [string, any],
                nvimFunctions: any) => {
         switch (name) {
            case "guifont":
            case "guifontwide":
                {
               if (value === "") {
                  break;
               }
               nvimGuifont.innerHTML = `* { ${guifontsToCSS(value)} }`;
               const [width, height] = getGridSize(elem);
               nvimFunctions.ui_try_resize_grid(getGridId(), width, height);
               }
               break;
            case "linespace":
               nvimLinespace.innerText = `.nvim_row { border-bottom: ${value}px }`;
               break;
            default:
               // arabicshape: too hard to implement
               // ambiwidth: too hard to implement
               // emoji: too hard to implement
               // pumblend: irrelevant
               // showtabline: irrelevant
               // termguicolors: irrelevant
               // ext_linegrid: already implemented
               // ext_multigrid: not needed
               // ext_hlstate: not needed
               // ext_termcolors: not needed
               break;
         }
   },
   win_external_pos: (_: any, [grid, win]: number[]) => {
      if (windowId !== undefined && matchesSelectedWindow(win)) {
         selectGrid(grid);
      }
   },
};

export function onRedraw(nvimFunctions: any,
                         events: any[],
                         elem: HTMLPreElement,
                         extCmdline: HTMLSpanElement,
                         extMessages: HTMLSpanElement) {
   externalMessages = extMessages;
   events.forEach(evt => {
      const [name, ...evts]: [keyof typeof redrawFuncs, any] = evt;
      if (redrawFuncs[name] !== undefined) {
         evts.forEach((args) => redrawFuncs[name](elem, args, nvimFunctions, extCmdline, extMessages));
      }
   });
}
