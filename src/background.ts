/**
 * Browser extensions have multiple processes. This is the entry point for the
 * [background process](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Anatomy_of_a_WebExtension#Background_scripts).
 * Our background process has multiple tasks:
 * - Keep track of per-tab values with its setTabValue/getTabValue functions
 * - Set the [browserActions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction)'s icon.
 * - Keep track of error messages/warnings that should are displayed in the
 *   browserAction.
 * - Update settings when the user changes their vimrc.
 * - Start new neovim instances when asked by a content script.
 * - Provide an RPC mechanism that enables calling background APIs from the
 *   browserAction/content script.
 *
 * The background process mostly acts as a slave for the browserAction and
 * content scripts. It rarely acts on its own.
 */
import * as browser from "webextension-polyfill";
import { isFirefox, svgPathToImageData } from "./utils/utils";

// We can't use the sessions.setTabValue/getTabValue apis firefox has because
// chrome doesn't support them. Instead, we create a map of tabid => {} kept in
// the background. This has the disadvantage of not surviving browser restarts,
// but's it's cross platform.
const tabValues = new Map();
function setTabValue(tabid: any, item: any, value: any) {
    let obj = tabValues.get(tabid);
    if (obj === undefined) {
        obj = {};
        tabValues.set(tabid, obj);
    }
    obj[item] = value;
}
function getTabValue(tabid: any, item: any) {
    const obj = tabValues.get(tabid);
    if (obj === undefined) {
        return undefined;
    }
    return obj[item];
}

const svgs = {
    disabled: "firenvim-disabled.svg",
    error: "firenvim-error.svg",
    normal: "firenvim.svg",
    notification: "firenvim-notification.svg",
};
// Return a `details` object suitable for use with browserAction.setIcon().
// This is needed because firefox allows using svg urls but Chrome requires
// svgs to be rendered to a canvas.
async function getIcon(name: keyof typeof svgs) {
    if (svgs[name] === undefined) {
        throw new Error(`Unknown svg icon ${name}!`);
    }
    const path = svgs[name];
    let details: any = { path };
    if (!isFirefox()) {
        const id = await svgPathToImageData(path);
        details = { imageData: id };
    }
    return details;
}
function updateIcon(tabId?: number) {
    let name: keyof typeof svgs = "normal";
    if (tabId !== undefined && getTabValue(tabId, "disabled") === "true") {
        name = "disabled";
    } else if (error !== "") {
        name = "error";
    } else if (warning !== "") {
        name = "notification";
    }
    return getIcon(name).then((icon: any) => browser.browserAction.setIcon(icon));
}

// Os is win/mac/linux/androis/cros. We only use it to add information to error
// messages on windows.
let os = "";
browser.runtime.getPlatformInfo().then((plat: any) => os = plat.os);

// Last error message
let error = "";

// Simple getter for easy RPC calls
function getError() {
    return error;
}

async function registerErrors(nvim: any, reject: any) {
    nvim.onDisconnect.addListener(async (p: any) => {
        error = "";
        updateIcon();
        if (p.error) {
            const errstr = p.error.toString();
            if (errstr.match(/no such native application/i)) {
                error = "Native manifest not found. Please run `:call firenvim#install(0)` in neovim.";
            } else if (errstr.match(/an unexpected error occurred/i)) {
                error = "The script supposed to start neovim couldn't be found."
                    + " Please run `:call firenvim#install(0)` in neovim";
                if (os === "win") {
                    error += " or try running the scripts in %LOCALAPPDATA%\\firenvim\\";
                }
                error += ".";
            } else {
                error = errstr;
            }
            updateIcon();
            reject(p.error);
        }
    });
}

// Last warning message
let warning = "";
async function checkVersion(nvimVersion: string) {
    const manifest = browser.runtime.getManifest();
    warning = "";
    if (manifest.version !== nvimVersion) {
        warning = `Neovim plugin version (${nvimVersion}) and firefox addon `
            + `version (${manifest.version}) do not match.`;
    }
    updateIcon();
}

// Function called in order to fill out default settings. Called from updateSettings.
function applySettings(settings: any) {
    function makeDefaults(obj: { [key: string]: any }, name: string, value: any) {
        if (obj[name] === undefined) {
            obj[name] = value;
        }
    }
    if (settings === undefined) {
        settings = {};
    }
    makeDefaults(settings, "globalSettings", {});
    makeDefaults(settings, "localSettings", {});
    makeDefaults(settings.localSettings, ".*", {});
    makeDefaults(settings.localSettings[".*"], "selector", "textarea");
    makeDefaults(settings.localSettings[".*"], "priority", 0);
    browser.storage.local.set(settings);
}

function fetchSettings() {
    return new Promise((resolve, reject) => {
        const nvim = browser.runtime.connectNative("firenvim");
        registerErrors(nvim, reject);
        nvim.onMessage.addListener((resp: any) => {
            checkVersion(resp.version);
            return resolve(resp.settings);
        });
        nvim.postMessage({
            newInstance: false,
        });
    });
}

function updateSettings() {
    return fetchSettings().then(applySettings);
}

function createNewInstance() {
    return new Promise((resolve, reject) => {
        const password = new Uint32Array(1);
        window.crypto.getRandomValues(password);

        const nvim = browser.runtime.connectNative("firenvim");
        registerErrors(nvim, reject);
        nvim.onMessage.addListener((resp: any) => {
            checkVersion(resp.version);
            applySettings(resp.settings);
            resolve({ password: password[0], port: resp.port });
        });
        nvim.postMessage({
            newInstance: true,
            origin: browser.runtime.getURL("").slice(0, -1),
            password: password[0],
        });
    });
}

async function toggleDisabled() {
    const tabId = (await browser.tabs.query({ active: true }))[0].id;
    const tabValue = getTabValue(tabId, "disabled");
    const disabled = !JSON.parse((tabValue as string) || "false");
    setTabValue(tabId, "disabled", `${disabled}`);
    updateIcon(tabId);
    return browser.tabs.sendMessage(tabId, { args: [disabled], funcName: ["setDisabled"] });
}

// Creating this first instance serves two purposes: make creating new neovim
// frames fast and also initialize settings the first time Firenvim is enabled
// in a browser.
let preloadedInstance = createNewInstance();

Object.assign(window, {
    // We need to stick the browser polyfill in `window` if we want the `exec`
    // call to be able to find it on Chrome
    browser,
    exec: (sender: any, args: any) => args.funcName.reduce((acc: any, cur: string) => acc[cur], window)(...(args.args)),
    getError: (sender: any, args: any) => getError(),
    getNewNeovimInstance: (sender: any, args: any) => {
        const result = preloadedInstance;
        preloadedInstance = createNewInstance();
        return result;
    },
    getTab: (sender: any, args: any) => sender.tab,
    getTabValue: (sender: any, args: any) => getTabValue(sender.tab.id, args[0]),
    getTabValueFor: (sender: any, args: any) => getTabValue(args[0], args[1]),
    messageOwnTab: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id, args),
    messageTab: (sender: any, args: any) => browser.tabs.sendMessage(args[0], args.slice(1)),
    setTabValue: (sender: any, args: any) => setTabValue(sender.tab.id, args[0], args[1]),
    toggleDisabled: (sender: any, args: any) => toggleDisabled(),
    updateSettings: (sender: any, args: any) => updateSettings(),
} as any);

browser.runtime.onMessage.addListener(async (request: any, sender: any, sendResponse: any) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return fn(sender, request.args !== undefined ? request.args : []);
});

browser.tabs.onActivated.addListener(async ({ tabId }: { tabId: number }) => {
    updateIcon(tabId);
});

updateIcon();
