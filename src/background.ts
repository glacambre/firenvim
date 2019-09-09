import * as browserProxy from "webextension-polyfill";
import { isFirefox, svgPathToImageData } from "./utils/utils";

// Chrome doesn't support getTabValue/setTabValue but we need it to know
// whether a tab is disabled or not.
if (!isFirefox()) {
    // Using chrome
    const tabValues = new Map();
    (window as any).browser = new Proxy(browserProxy, {
        get: (target, prop) => {
            if (prop === "sessions") {
                return new Proxy(target[prop], {
                    get: (target2, prop2) => {
                        if (prop2 === "setTabValue") {
                            return (tabid: any, item: any, value: any) => {
                                let obj = tabValues.get(tabid);
                                if (obj === undefined) {
                                    obj = {};
                                    tabValues.set(tabid, obj);
                                }
                                obj[item] = value;
                            };
                        }
                        if (prop2 === "getTabValue") {
                            return (tabid: any, item: any) => {
                                const obj = tabValues.get(tabid);
                                if (obj === undefined) {
                                    return Promise.resolve(undefined);
                                }
                                return Promise.resolve(obj[item]);
                            };
                        }
                        return target2[prop2];
                    },
                    set: (target2, prop2, value) => target2[prop2] = value,
                });
            }
            return target[prop];
        },
        set: (target, prop, value) => target[prop] = value,
    });
}

// Os is win/mac/linux/androis/cros. We only use it to add information to error
// messages on windows.
let os = "";
browser.runtime.getPlatformInfo().then((plat: any) => os = plat.os);

let error = "";

async function getIcon(path: string) {
    let details: any = { path };
    if (!isFirefox()) {
        const id = await svgPathToImageData(path);
        details = { imageData: id };
    }
    return details;
}

function getError() {
    return error;
}

async function registerErrors(nvim: any, reject: any) {
    nvim.onDisconnect.addListener(async (p: any) => {
        browser.browserAction.setIcon(await getIcon("firenvim.svg"));
        error = "";
        if (p.error) {
            const errstr = p.error.toString();
            browser.browserAction.setIcon(await getIcon("firenvim-error.svg"));
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
            reject(p.error);
        }
    });
}

async function checkVersion(nvimVersion: string) {
    const manifest = browser.runtime.getManifest();
    if (manifest.version !== nvimVersion) {
        error = `Neovim plugin version (${nvimVersion}) and firefox addon version (${manifest.version}) do not match.`;
        browser.browserAction.setIcon(await getIcon("firenvim-notification.svg"));
    }
}

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
            error = "";
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
    const tabValue = (await browser.sessions.getTabValue(tabId, "disabled"));
    const disabled = !JSON.parse((tabValue as string) || "false");
    await browser.sessions.setTabValue(tabId, "disabled", `${disabled}`);
    return browser.tabs.sendMessage(tabId, { args: [disabled], funcName: ["setDisabled"] });
}

let preloadedInstance = createNewInstance();

Object.assign(window, {
    exec: (sender: any, args: any) => args.funcName.reduce((acc: any, cur: string) => acc[cur], window)(...(args.args)),
    getError: (sender: any, args: any) => getError(),
    getNewNeovimInstance: (sender: any, args: any) => {
        const result = preloadedInstance;
        preloadedInstance = createNewInstance();
        return result;
    },
    getTab: (sender: any, args: any) => sender.tab,
    messageOwnTab: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id, args),
    messageTab: (sender: any, args: any) => browser.tabs.sendMessage(args[0], args.slice(1)),
    setDisabledIcon: async (sender: any, disabled: any) => {
        disabled = JSON.parse(disabled);
        const details = await getIcon(disabled ? "firenvim-disabled.svg" : "firenvim.svg");
        if (isFirefox() && !disabled) {
            details.path = undefined;
        }
        return browser.browserAction.setIcon(details);
    },
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

updateSettings();
