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
        var bookmark = document.createElement('span');
        bookmark.className = 'firenvim_bookmark'

        var range = window.getSelection().getRangeAt(0);
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
    // The NVIM line & column make no sense as tinymce selector.
    // Instead restore the cursor to the previously set bookmark and remove the bookmark.
    setCursor (line: number, column: number) {
        debugger;
        return executeInPage(`(${/* istanbul ignore next */ () => {
            debugger;
            var bookmark = document.getElementsByClassName('firenvim_bookmark')[0];
            var range = document.createRange ();
            range.selectNode(bookmark);

            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            return range.deleteContents();
        }})()`);
    }
}
