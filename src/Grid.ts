import { toHighlightClassName } from "./CSSUtils";
import { Cursor } from "./Cursor";

function new_cell_proxy(parent: any) {
    const span = document.createElement("span");
    span.innerText = "";
    span.className = "nvim_cell";
    (span as any).highlight = 0;
    parent.appendChild(span);
    return new Proxy(span, {
        get: (target, prop, receiver) => {
            if (prop === "highlight") {
                return (target as any).highlight;
            }
            if (prop === "value") {
                return target.innerText;
            }
            if (prop === "clear") {
                return () => { target.innerText = ""; };
            }
            if (prop === "setCursor") {
                return () => { target.classList.add("nvim_cursor"); };
            }
            if (prop === "removeCursor") {
                return () => { target.classList.remove("nvim_cursor"); };
            }
            throw new Error(`Accessing non-existing property ${prop.toString()} of cell.`);
        },
        set: (target, prop, value) => {
            if (prop === "highlight") {
                target.classList.remove(toHighlightClassName((target as any).highlight));
                (target as any).highlight = value;
                target.classList.add(toHighlightClassName((target as any).highlight));
                return true;
            }
            if (prop === "value") {
                target.innerText = value;
                return true;
            }
            throw new Error(`Setting non-existing property ${prop.toString()} of cell.`);
        },
    });
}

function new_row_proxy(width: number, parent: any) {
    const row: any[] = [];
    const span = document.createElement("span");
    span.className = "nvim_row";
    for (let i = 0; i < width; ++i) {
        row.push(new_cell_proxy(span));
    }
    parent.appendChild(span);
    function clear() {
        row.forEach(cell => cell.clear());
    }
    return new Proxy(row, {
        get: (target: any, prop: any, receiver) => {
            const p = Number.parseInt(prop, 10);
            if (p >= 0 && p < target.length) {
                return target[p];
            }
            if (prop === "clear") {
                return clear;
            }
            throw new Error(`Accessing non-exisiting property ${prop} of row.`);
        },
        set: (target: any, prop: number, value) => {
            target[prop].value = value;
            return true;
        },
    });
}

export function new_grid(width: number, height: number, elem: any) {
    const gridElem = document.createElement("div");
    const grid: any[] = [];
    for (let i = 0; i < height; ++i) {
        grid.push(new_row_proxy(width, gridElem));
    }
    elem.appendChild(gridElem);
    let cursor = new Cursor(0, 0);
    function clear() {
        grid.forEach(row => row.clear());
    }
    function cursor_goto(x: number, y: number) {
        grid[cursor.y][cursor.x].removeCursor();
        cursor = new Cursor(x, y);
        grid[cursor.y][cursor.x].setCursor();
    }
    return new Proxy(grid, {
        get: (target, prop: any, receiver) => {
            const p = Number.parseInt(prop, 10);
            if (p >= 0 && p < target.length) {
                return target[p];
            }
            if (prop === "clear") {
                return clear;
            }
            if (prop === "cursor_goto") {
                return cursor_goto;
            }
            throw new Error(`Accessing non-exisiting property ${prop} of row.`);
        },
        set: (target, prop: any, value) => {
            console.log(target, prop, value);
            return true;
        },
    });
}
