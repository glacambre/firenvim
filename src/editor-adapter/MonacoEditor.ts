import { GenericAbstractEditor, AbstractEditorOptions, wrapper, unwrapper } from "./AbstractEditor";

/* istanbul ignore next */
export class MonacoEditor extends GenericAbstractEditor {

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
    constructor(e: HTMLElement, options: AbstractEditorOptions)  {
        super(e, options);
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

    getContent = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = unwrap(window).monaco.editor.getModel(uri);
        return wrap(model.getValue());
    }

    // It's impossible to get Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    getCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        return [1, 0] as [number, number];
    }

    getElement = () => {
        return this.elem;
    }

    getLanguage = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = unwrap(window).monaco.editor.getModel(uri);
        return wrap(model.getModeId());
    }

    setContent = async (selector: string, wrap: wrapper, unwrap: unwrapper, text: string) => {
        const elem = document.querySelector(selector) as any;
        const uri = elem.getAttribute("data-uri");
        const model = unwrap(window).monaco.editor.getModel(uri);
        return wrap(model.setValue(text));
    }

    // It's impossible to set Monaco's cursor position:
    // https://github.com/Microsoft/monaco-editor/issues/258
    setCursor = async (_selector: string, _wrap: wrapper, _unwrap: unwrapper, _line: number, _column: number): Promise<undefined> => {
        return undefined;
    }

}
