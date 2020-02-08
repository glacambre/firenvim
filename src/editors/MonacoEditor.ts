import { executeInPage } from "../utils/utils";
import { computeSelector } from "../utils/CSSUtils";
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
                 && this.elem.getAttribute("data-uri").match("inmemory://"))) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    getContent () {
        return executeInPage(`(${(selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.getValue();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    getElement () {
        return this.elem;
    }

    setContent (text: string) {
        return executeInPage(`(${(selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            const uri = elem.getAttribute("data-uri");
            const model = (window as any).monaco.editor.getModel(uri);
            return model.setValue(str);
        }})(${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }
}
