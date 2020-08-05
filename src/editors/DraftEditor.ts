import { computeSelector, executeInPage } from "../utils/utils";
import { AbstractEditor } from "./AbstractEditor";

export class DraftEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        let parent = e;
        for (let i = 0; i < 3; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/DraftEditor/g).test(parent.className)) {
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
    }

    getContent () {
        return executeInPage(`(${(selec: string) => {
            let elem = document.querySelector(selec) as any;
            let editorState : any = undefined;
            do {
                const prop = Object.keys(elem).find(k => k.startsWith("__reactInternalInstance"));
                if (elem[prop] === undefined) {
                    return elem.innerText;
                }
                // TODO: replace with optional chaining once the build system supports it
                editorState = Object
                    .values(((elem[prop] || {}).child || {}).pendingProps || {})
                    .find((state: any) => (typeof (state || {}).getCurrentContent) === "function");
                elem = elem.parentElement;
            } while (editorState === undefined);
            return editorState.getCurrentContent().getPlainText();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    getCursor () {
        return Promise.resolve([1, 0] as [number, number]);
    }

    getElement () {
        return this.elem;
    }

    getLanguage () {
        return Promise.resolve(undefined);
    }

    setContent (text: string) {
        return executeInPage(`(${(selec: string, txt: string) => {
            console.log("setContent...");
            // Courtesy of Venryx:
            // https://stackoverflow.com/questions/29321742/react-getting-a-component-from-a-dom-element-for-debugging
            // What would modern man do without stackoverflow?
            let findReact = (dom: any, traverseUp = 0) => {
                const key = Object.keys(dom).find(key=>key.startsWith("__reactInternalInstance$"));
                const domFiber = dom[key];
                if (domFiber == null) return null;

                // react <16
                if (domFiber._currentElement) {
                    let compFiber = domFiber._currentElement._owner;
                    for (let i = 0; i < traverseUp; i++) {
                        compFiber = compFiber._currentElement._owner;
                    }
                    return compFiber._instance;
                }

                // react 16+
                const GetCompFiber = (fiber: any) => {
                    //return fiber._debugOwner; // this also works, but is __DEV__ only
                    let parentFiber = fiber.return;
                    while (typeof parentFiber.type == "string") {
                        parentFiber = parentFiber.return;
                    }
                    return parentFiber;
                };
                let compFiber = GetCompFiber(domFiber);
                for (let i = 0; i < traverseUp; i++) {
                    compFiber = GetCompFiber(compFiber);
                }
                return compFiber.stateNode;
            }

            let elem = document.querySelector(selec) as any;
            const prop = Object.keys(elem).find(k => k.startsWith("__reactInternalInstance"));
            let editorState = Object
                .values(((elem[prop] || {}).child || {}).pendingProps || {})
                .find((state: any) => (typeof (state || {}).getCurrentContent) === "function") as any;
            const EditorState = editorState.constructor;
            const ContentState = editorState.getCurrentContent().constructor;
            const newContentState = ContentState.createFromText(txt);
            const newEditorState = EditorState.createWithContent(newContentState);
            const reactElem = findReact(elem, 1);
            reactElem.setState.call(reactElem, {editorState: newEditorState});
        }})(${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }

    setCursor (line: number, column: number) {
        return Promise.resolve();
    }
}
