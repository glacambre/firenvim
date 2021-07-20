import { computeSelector, executeInPage } from "../utils/utils";
import { AbstractEditor } from "./AbstractEditor";

export class MonacoEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        let parent = e;
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
    constructor (e: HTMLElement) {
        super();
        this.elem = e;
        // Find the monaco element that holds the data
        let parent = this.elem.parentElement;
        while (!(this.elem.className.match(/monaco-editor/gi)
                 && this.elem.getAttribute("data-uri").match("file://|inmemory://|gitlab:"))) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    getContent () {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.getValue();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    // It's impossible to get Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    getCursor () {
        return Promise.resolve([1, 0] as [number, number]);
    }

    getElement () {
        return this.elem;
    }

    getLanguage () {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.getModeId();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    setContent (text: string) {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.setValue(str);
        }})(${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }

    // It's impossible to set Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    setCursor (_line: number, _column: number) {
        return Promise.resolve();
    }

}
