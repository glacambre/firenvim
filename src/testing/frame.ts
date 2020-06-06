// This script is only loaded in firefox-testing and chrome-testing builds
// (check manifest.json). It lets selenium know that Firenvim is ready to
// receive events by turning a global variable named firenvimReady to true in
// the topmost window.
import { isReady } from "../NeovimFrame.ts";
import { page } from "../page/proxy";

isReady.then(() => page.evalInPage(`window.firenvimReady = true;`));
