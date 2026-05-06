import { AbstractEditorOptions } from "./AbstractEditor";

/* istanbul ignore next */
export class MonacoEditor {

    static matches (e: HTMLElement) {
        let parent: HTMLElement | null = e;
        for (let i = 0; i < 4; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/monaco-editor/gi).test(parent.className)) {
                    return true;
                }
                parent = parent.parentElement;
            }
        }
        return false;
    }

    private elem: HTMLElement;
    constructor(e: HTMLElement, _options: AbstractEditorOptions)  {
        this.elem = e;
        // Find the monaco element that holds the data
        let parent: HTMLElement | null = this.elem.parentElement;
        while (!(this.elem.className.match(/monaco-editor/gi)
                 && this.elem.getAttribute("data-uri")?.match("file://|inmemory://|gitlab:"))) {
            if (parent === null) {
                break;
            }
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    /* istanbul ignore next */
    static getContent = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = (window as any).monaco.editor.getModel(uri);
        return model.getValue();
    }

    // It's impossible to get Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    /* istanbul ignore next */
    static getCursor = async (_selector: string) => {
        return [1, 0] as [number, number];
    }

    getElement () {
        return this.elem;
    }

    /* istanbul ignore next */
    static getLanguage = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = (window as any).monaco.editor.getModel(uri);
        return model.getModeId();
    }

    /* istanbul ignore next */
    static setContent = async (selector: string, text: string) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = (window as any).monaco.editor.getModel(uri);
        return model.setValue(text);
    }

    // It's impossible to set Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    /* istanbul ignore next */
    static setCursor = async (_selector: string, _line: number, _column: number): Promise<undefined> => {
        return undefined;
    }

}
