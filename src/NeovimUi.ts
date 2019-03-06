import { neovim } from "./Neovim";

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
                n.input(evt.key);
                evt.preventDefault();
                evt.stopImmediatePropagation();
            }
        });
    });
});
