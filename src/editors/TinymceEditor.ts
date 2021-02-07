import { AbstractEditor } from "./AbstractEditor";
import { executeInPage, computeSelector } from "../utils/utils";

export class TinymceEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        return (e.id === 'tinymce');
    }

    private elem: HTMLElement;
    constructor (e: HTMLElement) {
        super();
        this.elem = e;
    }

    getContent () {
        const text = this.elem.innerHTML;
        return Promise.resolve(text);
    }

    // It doesn't make a lot of sense to calculate cursor's position (if at all possible).
    // The content will usually be a condensed HTML source of the rendered text.
    // However we can set a bookmark so that cursor position can be restored later.
    getCursor () {
        const bookmark = document.createElement('span');
        bookmark.className = 'firenvim_bookmark';

        const range = window.getSelection().getRangeAt(0);
        range.insertNode(bookmark);

        return Promise.resolve([1, 0] as [number, number]);
    }

    getElement () {
        return this.elem;
    }

    getLanguage () {
        return Promise.resolve('html');
    }

    setContent (text: string) {
        this.elem.innerHTML = text;
        return Promise.resolve();
    }

    // TODO: this does not work
    // I also tried using window.tinymce.activeEditor API, but the editor leaves in the parent window
    // not the frame which is currently focused
    //
    // The NVIM line & column make no sense as tinymce selector.
    // Instead restore the cursor to the previously set bookmark and remove the bookmark.
    setCursor (line: number, column: number) {
        return executeInPage(`(${/* istanbul ignore next */ () => {
            const bookmark = document.getElementsByClassName('firenvim_bookmark')[0];
            const range = document.createRange ();
            range.selectNode(bookmark);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            return range.deleteContents();
        }})()`);
    }
}
