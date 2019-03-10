
export function getFunctions(global: {
    lastEditorLocation: [string, string],
    selectorToElems: Map<string, [HTMLSpanElement, HTMLElement]>,
}) {
    return {
        getEditorLocation: () => global.lastEditorLocation,
        getElementContent: (selector: string) => {
            const [_, e] = global.selectorToElems.get(selector) as [any, any];
            if (e.value !== undefined) {
                return e.value;
            }
            if (e.textContent !== undefined) {
                return e.textContent;
            }
            return e.innerText;
        },
        killEditor: (selector: string) => {
            const [e, _] = global.selectorToElems.get(selector) as [any, any];
            e.parentNode.removeChild(e);
            global.selectorToElems.delete(selector);
        },
        setElementContent: (selector: string, text: string) => {
            const [_, e] = global.selectorToElems.get(selector) as [any, any];
            if (e.value !== undefined) {
                e.value = text;
            } else {
                e.textContent = text;
            }
        },
    };
}
