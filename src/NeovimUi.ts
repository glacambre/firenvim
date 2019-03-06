import { neovim } from "./Neovim";

window.addEventListener("load", async () => {
    const nvim = await neovim(document.getElementById("pre") as HTMLPreElement);
    await nvim.ui_attach(80, 20, {
        ext_linegrid: true,
        rgb: true,
    });
    window.addEventListener("keydown", (evt) => {
        if (evt.isTrusted) {
            nvim.input(evt.key);
            evt.preventDefault();
            evt.stopImmediatePropagation();
        }
    });
});
