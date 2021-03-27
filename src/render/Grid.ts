import { Cursor } from "./Cursor";
import { Row } from "./Row";

export class Grid {
    public parent: HTMLElement;
    private elem: HTMLDivElement;
    private rows: Row[] = [];
    private cursorLine: Row = undefined;
    private cursor = new Cursor(0, 0);

    constructor(public width: number, public height: number) {
        this.elem = document.createElement("div");
        this.elem.className = "nvim_grid";
        for (let i = 0; i < height; ++i) {
            this.rows.push(new Row(width));
            this.rows[this.rows.length - 1].attach(this.elem);
        }
    }

    public attach(p: HTMLElement) {
        this.parent = p;
        this.parent.appendChild(this.elem);
    }

    public clear() {
        this.rows.forEach(row => row.clear());
    }

    public cursor_goto(x: number, y: number) {
        if (this.cursorLine !== undefined) {
            const cell = this.cursorLine.get(this.cursor.x);
            if (cell !== undefined) {
                cell.removeCursor();
            }
        }
        this.cursor = new Cursor(x, y);
        this.cursorLine = this.get(this.cursor.y);
        this.cursorLine.get(this.cursor.x).setCursor();
    }

    public detach() {
        this.elem.parentNode.removeChild(this.elem);
    }

    public get(n: number) {
        if (n < 0 || n >= this.height) {
            throw new Error(`Out of bounds access: ${n}`);
        }
        return this.rows[n];
    }

    public resize(width: number, height: number) {
        if (height < this.height) {
            this.rows.slice(height).forEach(row => row.detach());
            this.rows = this.rows.slice(0, height);
        } else {
            for (let i = this.height; i < height; ++i) {
                this.rows.push(new Row(this.width));
                this.rows[this.rows.length - 1].attach(this.elem);
            }
        }
        if (width !== this.width) {
            this.rows.forEach(row => row.resize(width));
        }
        this.width = width;
        this.height = height;
    }

    public scroll(top: number, bot: number, left: number, right: number, rows: number, _cols: number) {
        if (rows > 0) {
            for (let i = top + 1; i < bot; ++i) {
                const srcRow = this.rows[i];
                const dstRow = this.rows[i - rows];
                if (dstRow === undefined) {
                    continue;
                }
                for (let j = left; j < right; ++j) {
                    const srcCell = srcRow.get(j);
                    const dstCell = dstRow.get(j);
                    dstCell.value = srcCell.value;
                    dstCell.highlight = srcCell.highlight;
                }
            }
        } else if (rows < 0) {
            for (let i = bot - 1 + rows; i >= top; --i) {
                const srcRow = this.rows[i];
                const dstRow = this.rows[i - rows];
                if (dstRow === undefined) {
                    continue;
                }
                for (let j = left; j < right; ++j) {
                    const srcCell = srcRow.get(j);
                    const dstCell = dstRow.get(j);
                    dstCell.value = srcCell.value;
                    dstCell.highlight = srcCell.highlight;
                }
            }
        }
    }
}
