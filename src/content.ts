import {NeovimProcess} from "./NeovimProcess";

const nvim = new NeovimProcess();
nvim.stdout.addListener("message", console.log);
nvim.stdin.write("nvim_get_api_info", []);
