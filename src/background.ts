import * as NeovimClient from "promised-neovim-client";
import {NeovimProcess} from "./NeovimProcess";

console.log("Firenvim content script loaded.");
const nvimProc = new NeovimProcess();

NeovimClient.attach(nvimProc.stdin, nvimProc.stdout).then((nvim: any) => {
    console.log("Neovim attached");
    nvim.on("request", (method: any, args: any, resp: any) => {
        console.log("request", method, args, resp);
    });
    nvim.on("notification", (method: any, args: any) => {
        console.log("notification", method, args);
    });
}).catch((err: any) => console.log(err));

console.log("Promised-neovim-cleint required.");
