const fs = require("fs");
const os = require("os");
const path = require("path");
const process = require("process");
const spawn = require("child_process").spawn;

export function setupVimrc() {
        process.env.XDG_CONFIG_HOME = os.tmpdir();
        const nvimdir = path.join(process.env.XDG_CONFIG_HOME, "nvim");
        try {
                fs.mkdirSync(nvimdir);
        } catch (e) {}
        process.env.MYVIMRC = path.join(nvimdir, "init.vim");
        writeVimrc(`set rtp+=${process.cwd()}\n`);
};

export function readVimrc() {
        return fs.readFileSync(process.env.MYVIMRC).toString();
};

export function writeVimrc(content: string) {
        fs.writeFileSync(process.env.MYVIMRC, content);
};

