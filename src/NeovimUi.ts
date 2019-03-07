import { neovim } from "./Neovim";

function translateKey(text: string) {
    switch (text) {
        case " ":
            return "<Space>";
        case "ArrowDown":
            return "<Down>";
        case "ArrowLeft":
            return "<Left>";
        case "ArrowRight":
            return "<Right>";
        case "ArrowUp":
            return "<Up>";
        case "Backspace":
            return "<BS>";
        case "Delete":
            return "<Del>";
        case "End":
            return "<End>";
        case "Enter":
            return "<CR>";
        case "Escape":
            return "<Esc>";
        case "Home":
            return "<Home>";
        case "PageDown":
            return "<PageDown>";
        case "PageUp":
            return "<PageUp>";
        case "Tab":
            return "<Tab>";
        case "<":
            return "<lt>";
        case "\\":
            return "<Bslash>";
        case "|":
            return "<Bar>";
    }
    return text;
}

function addModifier(mod: string, text: string) {
    let match;
    let modifiers = "";
    let key = "";
    if ((match = text.match(/^<([A-Z]{1,5})-(.+)>$/))) {
        modifiers = match[1];
        key = match[2];
    } else if ((match = text.match(/^<(.+)>$/))) {
        key = match[1];
    } else {
        key = text;
    }
    return "<" + mod + modifiers + "-" + key + ">";
}

window.addEventListener("load", async () => {
    const host = document.getElementById("pre") as HTMLPreElement;
    const nvim = neovim(host);

    // We need to know how wide our characters are
    const span = document.createElement("span");
    span.innerText = " ";
    host.appendChild(span);
    const { width: charWidth, height: charHeight } = span.getBoundingClientRect();
    host.removeChild(span);
    const rect = host.getBoundingClientRect();
    const cols = Math.floor(rect.width / charWidth);
    const rows = Math.floor(rect.height / charHeight);

    nvim.then(n => {
        n.ui_attach(cols, rows, {
            ext_linegrid: true,
            rgb: true,
        });
        window.addEventListener("keydown", (evt) => {
            if (evt.isTrusted) {
                const special = false;
                const text = [["altKey", "A"], ["ctrlKey", "C"], ["metaKey", "M"], ["shiftKey", "S"]]
                    .reduce((key: string, [attr, mod]: [string, string]) => {
                        if ((evt as any)[attr]) {
                            return addModifier(mod, key);
                        }
                        return key;
                    }, translateKey(evt.key));
                n.input(text);
                evt.preventDefault();
                evt.stopImmediatePropagation();
            }
        });
    });
});
