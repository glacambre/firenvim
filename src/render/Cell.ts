import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]
import { toHighlightClassName } from "../utils/CSSUtils";

export class Cell {
    private highlightValue: number;
    private elem: HTMLSpanElement;

    constructor() {
        this.elem = document.createElement("span");
        this.elem.innerText = " ";
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
        return this.elem.innerText;
    }

    set value(v: string) {
        this.elem.innerText = v;
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
