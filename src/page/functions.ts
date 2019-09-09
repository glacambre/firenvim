import * as browser from "webextension-polyfill";

function _getElementContent(e: any) {
    if (e.value !== undefined) {
        return e.value;
    }
    if (e.textContent !== undefined) {
        return e.textContent;
    }
    return e.innerText;
}

export function getFunctions(global: {
    lastEditorLocation: [string, string, number],
    nvimify: (evt: FocusEvent) => void,
    selectorToElems: Map<string, PageElements>,
    disabled: boolean | Promise<boolean>,
}) {
    return {
        getEditorLocation: () => global.lastEditorLocation,
        getElementContent: (selector: string) => _getElementContent(global.selectorToElems.get(selector).input),
        killEditor: (selector: string) => {
            const { span, input } = global.selectorToElems.get(selector);
            span.parentNode.removeChild(span);
            global.selectorToElems.delete(selector);
            input.removeEventListener("focus", global.nvimify);
            input.focus();
            input.addEventListener("focus", global.nvimify);
        },
        resizeEditor: (selector: string, width: number, height: number) => {
            const { iframe } = global.selectorToElems.get(selector);
            iframe.style.width = `${width}px`;
            iframe.style.height = `${height}px`;
        },
        setDisabled: (disabled: boolean) => {
            global.disabled = disabled;
            return browser.runtime.sendMessage({
                args: disabled,
                funcName: ["setDisabledIcon"],
            });
        },
        setElementContent: (selector: string, text: string) => {
            const { input: e } = global.selectorToElems.get(selector) as any;
            if (e.value !== undefined) {
                e.value = text;
            } else {
                e.textContent = text;
            }
            e.dispatchEvent(new Event("keydown",     { bubbles: true }));
            e.dispatchEvent(new Event("keyup",       { bubbles: true }));
            e.dispatchEvent(new Event("keypress",    { bubbles: true }));
            e.dispatchEvent(new Event("beforeinput", { bubbles: true }));
            e.dispatchEvent(new Event("input",       { bubbles: true }));
            e.dispatchEvent(new Event("change",      { bubbles: true }));
        },
        setElementCursor: (selector: string, line: number, column: number) => {
            const { input } = global.selectorToElems.get(selector) as any;
            const pos = _getElementContent(input)
                .split("\n")
                .reduce((acc: number, l: string, index: number) => acc + (index < (line - 1)
                    ? (l.length + 1)
                    : 0), column + 1);
            input.setSelectionRange(pos, pos);
        },
    };
}
