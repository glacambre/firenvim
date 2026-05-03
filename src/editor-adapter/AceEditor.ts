import { GenericAbstractEditor, AbstractEditorOptions, wrapper, unwrapper } from "./AbstractEditor";

/* istanbul ignore next */
export class AceEditor extends GenericAbstractEditor {

    static matches (e: HTMLElement) {
        let parent: HTMLElement | null = e;
        for (let i = 0; i < 3; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/ace_editor/gi).test(parent.className)) {
                    return true;
                }
                parent = parent.parentElement;
            }
        }
        return false;
    }

    private elem: HTMLElement;
    constructor(e: HTMLElement, _options: AbstractEditorOptions) {
        super(e, _options);
        this.elem = e;
        // Get the topmost ace element
        let parent: HTMLElement | null = this.elem.parentElement;
        while (parent !== null && AceEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    // This function will be stringified and inserted in page context so we
    // can't instrument it.
    /* istanbul ignore next */
    private getAce = (selec: string) => {
    };

    getContent = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || unwrap(window).ace.edit(elem);
        return wrap(ace.getValue());
    }

    getCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        let position;
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || unwrap(window).ace.edit(elem);
        if (ace.getCursorPosition !== undefined) {
            position = ace.getCursorPosition();
        } else {
            position = ace.selection.cursor;
        }
        return [wrap(position.row) + 1, wrap(position.column)] as [number, number];
    }

    getElement = () => {
        return this.elem;
    }

    getLanguage = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || unwrap(window).ace.edit(elem);
        return wrap(ace.session.$modeId).split("/").slice(-1)[0];
    }

    setContent = async (selector: string, wrap: wrapper, unwrap: unwrapper, text: string) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || unwrap(window).ace.edit(elem);
        return wrap(ace.setValue(text, 1));
    }

    setCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper, line: number, column: number) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || unwrap(window).ace.edit(elem);
        const selection = ace.getSelection();
        return wrap(selection.moveCursorTo(line - 1, column, false));
    }
}
