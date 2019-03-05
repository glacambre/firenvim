import { neovim } from "./NeovimProcess";

(async () => {
    const nvim = await neovim();
    console.log(nvim);
    await nvim.ui_attach(80, 20, {
        ext_linegrid: true,
        rgb: true,
    });
    await nvim.command(":edit /tmp/hello");
    await nvim.feedkeys("aaaaaaaa", "n", false);
    await nvim.command("write");
    await nvim.command("quit");
})();
