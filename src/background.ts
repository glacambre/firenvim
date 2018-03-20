///<reference path="firenvim.d.ts" />

console.log("Firenvim content script loaded.");
let NvimProcess = require("./NeovimProcess.js").NeovimProcess;
let nvim = new NvimProcess();

require("promised-neovim-client").attach(nvim.stdin, nvim.stdout).then((nvim: any) => {
    nvim.on("request", (method: any, args: any, resp: any) => {
        console.log("request", method, args, resp)
    });
    nvim.on("notification", (method: any, args: any) => {
        console.log("notification", method, args)
    });
}).catch((err: any) => console.log(err));

console.log("Promised-neovim-cleint required.");
