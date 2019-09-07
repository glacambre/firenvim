import * as browser from "webextension-polyfill";

let os = "";
browser.runtime.getPlatformInfo((plat: any) => os = plat.os);

let error = "";

function getError() {
    return error;
}

function registerErrors(nvim: any, reject: any) {
    browser.browserAction.setIcon({ path: "firenvim.svg" });
    nvim.onDisconnect.addListener((p: any) => {
        error = "";
        if (p.error) {
            const errstr = p.error.toString();
            browser.browserAction.setIcon({ path: "firenvim-error.svg" });
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

function checkVersion(nvimVersion: string) {
    const manifest = browser.runtime.getManifest();
    if (manifest.version !== nvimVersion) {
        error = `Neovim plugin version (${nvimVersion}) and firefox addon version (${manifest.version}) do not match.`;
        browser.browserAction.setIcon({ path: "firenvim-notification.svg" });
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
    const disabled = !(await browser.sessions.getTabValue(tabId, "disabled"));
    await browser.sessions.setTabValue(tabId, "disabled", disabled);
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
    toggleDisabled: (sender: any, args: any) => toggleDisabled(),
    updateSettings: (sender: any, args: any) => updateSettings(),
} as any);

browser.runtime.onMessage.addListener(async (request: any, sender: any, sendResponse: any) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return fn(sender, request.args || []);
});

updateSettings();
