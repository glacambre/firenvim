// This script is only loaded in firefox-testing and chrome-testing builds
// (check manifest.json if you want to make sure of that) It provides a way for
// the page to ask the webextension to reload the neovim instance. This is
// necessary for testing reasons (we sometimes might create states that
// "poison" firenvim and need to reset it).

import { executeInPage } from "../utils/utils";

window.addEventListener("firenvim-updateSettings", () => {
    browser.runtime.sendMessage({ funcName: [ "updateSettings"] })
        .catch((): undefined => undefined)
        .then(() => executeInPage(`window.dispatchEvent(new Event("firenvim-settingsUpdated"))`));
});
