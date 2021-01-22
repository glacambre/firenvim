export function toHighlightClassName(n: number) {
    return "nvim_highlight_" + n;
}

export class Cell {
    private highlightValue: number;
    private elem: HTMLSpanElement;
    private val: string;

    constructor() {
        this.elem = document.createElement("span");
        this.val = " ";
        this.elem.innerText = this.val;
        this.elem.className = "nvim_cell";
        this.highlight = 0;
    }

    public attach(parent: HTMLElement) {
        parent.appendChild(this.elem);
    }

    public detach() {
        this.elem.parentNode.removeChild(this.elem);
    }

    get highlight() {
        return this.highlightValue;
    }

    set highlight(n: number) {
        this.elem.classList.remove(toHighlightClassName(this.highlightValue));
        this.highlightValue = n;
        this.elem.classList.add(toHighlightClassName(this.highlightValue));
    }

    get value() {
        return this.val;
    }

    set value(v: string) {
        this.val = v;
        this.elem.innerText = this.val;
    }

    public clear() {
        this.value = " ";
    }

    public setCursor() {
        this.elem.classList.add("nvim_cursor");
    }

    public removeCursor() {
        this.elem.classList.remove("nvim_cursor");
    }
}
