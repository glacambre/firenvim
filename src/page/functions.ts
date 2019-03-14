
export function getFunctions(global: {
    lastEditorLocation: [string, string],
    nvimify: (evt: FocusEvent) => void,
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
            const tuple = global.selectorToElems.get(selector) as [any, any];
            if (tuple) {
                const [span, input] = tuple;
                span.parentNode.removeChild(span);
                global.selectorToElems.delete(selector);
                input.removeEventListener("focus", global.nvimify);
                input.focus();
                input.addEventListener("focus", global.nvimify);
            }
        },
        setElementContent: (selector: string, text: string) => {
            const [_, e] = global.selectorToElems.get(selector) as [any, any];
            if (e.value !== undefined) {
                e.value = text;
            } else {
                e.textContent = text;
            }
            e.dispatchEvent(new Event("change", { bubbles: true }));
        },
    };
}
