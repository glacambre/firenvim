const fs = require("fs");
const os = require("os");
const path = require("path");
const process = require("process");
const spawn = require("child_process").spawn;

let init_vim: string;

export function setupVimrc() {
        const base_dir = path.join(os.tmpdir(), "firenvim_test_run", `${Math.round(Math.random() * 100000)}`);
        process.env.XDG_CONFIG_HOME = path.join(base_dir, "config");
        process.env.XDG_DATA_HOME = path.join(base_dir, "data");
        const nvim_conf_dir = path.join(process.env.XDG_CONFIG_HOME, "nvim");
        const nvim_data_dir = path.join(process.env.XDG_DATA_HOME, "nvim");
        try {
                fs.mkdirSync(nvim_conf_dir, { recursive: true });
                fs.mkdirSync(nvim_conf_dir, { recursive: true });
        } catch (e) {
                console.error("Failed to create config/data dirs");
        }
        init_vim = path.join(nvim_conf_dir, "init.vim");
        return resetVimrc();
};

export function resetVimrc() {
        return writeVimrc(`set rtp+=${process.cwd()}\n`);
}

export function readVimrc() {
        if (init_vim === undefined) {
                throw new Error("readVimrc called without setupVimrc!");
        }
        return fs.readFileSync(init_vim).toString();
};

export function writeVimrc(content: string) {
        if (init_vim === undefined) {
                throw new Error("writeVimrc called without setupVimrc!");
        }
        return fs.writeFileSync(init_vim, content);
};

