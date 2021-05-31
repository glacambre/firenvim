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
import { getGlobalConf, ISiteConfig } from "./utils/configuration";
import { getIconImageData, IconKind, isThunderbird } from "./utils/utils";

export let preloadedInstance: Promise<any>;

type tabId = number;
type tabStorage = {
    disabled: boolean,
};
// We can't use the sessions.setTabValue/getTabValue apis firefox has because
// chrome doesn't support them. Instead, we create a map of tabid => {} kept in
// the background. This has the disadvantage of not surviving browser restarts,
// but's it's cross platform.
const tabValues = new Map<tabId, tabStorage>();
function setTabValue(tabid: tabId, item: keyof tabStorage, value: any) {
    let obj = tabValues.get(tabid);
    if (obj === undefined) {
        obj = { "disabled": false };
        tabValues.set(tabid, obj);
    }
    obj[item] = value;
}
function getTabValue(tabid: tabId, item: keyof tabStorage) {
    const obj = tabValues.get(tabid);
    if (obj === undefined) {
        return undefined;
    }
    return obj[item];
}

async function updateIcon(tabid?: number) {
    let name: IconKind = "normal";
    if (tabid === undefined) {
        tabid = (await browser.tabs.query({ active: true, currentWindow: true }))[0].id;
    }
    if (getTabValue(tabid, "disabled") === true) {
        name = "disabled";
    } else if (error !== "") {
        name = "error";
    } else if (warning !== "") {
        name = "notification";
    }
    // Can't test on the bird of thunder
    /* istanbul ignore next */
    if (isThunderbird()) {
        return Promise.resolve();
    }
    return getIconImageData(name).then((imageData: any) => browser.browserAction.setIcon({ imageData }));
}

// Os is win/mac/linux/androis/cros. We only use it to add information to error
// messages on windows.
let os = "";
browser.runtime.getPlatformInfo().then((plat: any) => os = plat.os);

// Last error message
let error = "";

// Simple getter for easy RPC calls. Can't be tested as requires opening
// browserAction.
/* istanbul ignore next */
function getError() {
    return error;
}

function registerErrors(nvim: any, reject: any) {
    error = "";
    const timeout = setTimeout(() => {
        nvim.timedOut = true;
        error = "Neovim is not responding.";
        updateIcon();
        nvim.disconnect();
        reject(error);
    }, 10000);
    nvim.onDisconnect.addListener(async (p: any) => {
        clearTimeout(timeout);
        updateIcon();
        // Unfortunately this error handling can't be tested as it requires
        // side-effects on the OS.
        /* istanbul ignore next */
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
            } else if (errstr.match(/Native application tried to send a message of/)) {
                error = "Unexpected output. Run `nvim --headless` and ensure it prints nothing.";
            } else {
                error = errstr;
            }
            updateIcon();
            reject(p.error);
        } else if (!nvim.replied && !nvim.timedOut) {
            error = "Neovim died without answering.";
            updateIcon();
            reject(error);
        }
    });
    return timeout;
}

// Last warning message
let warning = "";
/* istanbul ignore next */
function getWarning() {
    return warning;
}
let nvimPluginVersion = "";
async function checkVersion(nvimVersion: string) {
    nvimPluginVersion = nvimVersion;
    const manifest = browser.runtime.getManifest();
    warning = "";
    // Can't be tested as it would require side effects on the OS.
    /* istanbul ignore next */
    if (manifest.version !== nvimVersion) {
        warning = `Neovim plugin version (${nvimVersion}) and browser addon `
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
    function makeDefaultLocalSetting(sett: { localSettings: { [key: string]: any } },
                                     site: string,
                                     obj: ISiteConfig) {
        makeDefaults(sett.localSettings, site, {});
        for (const key of (Object.keys(obj) as (keyof typeof obj)[])) {
            makeDefaults(sett.localSettings[site], key, obj[key]);
        }
    }
    if (settings === undefined) {
        settings = {};
    }

    makeDefaults(settings, "globalSettings", {});
    // "<KEY>": "default" | "noop"
    // #103: When using the browser's command API to allow sending `<C-w>` to
    // firenvim, whether the default action should be performed if no neovim
    // frame is focused.
    makeDefaults(settings.globalSettings, "<C-n>", "default");
    makeDefaults(settings.globalSettings, "<C-t>", "default");
    makeDefaults(settings.globalSettings, "<C-w>", "default");
    // Note: <CS-*> are currently disabled because of
    // https://github.com/neovim/neovim/issues/12037
    // Note: <CS-n> doesn't match the default behavior on firefox because this
    // would require the sessions API. Instead, Firefox's behavior matches
    // Chrome's.
    makeDefaults(settings.globalSettings, "<CS-n>", "default");
    // Note: <CS-t> is there for completeness sake's but can't be emulated in
    // Chrome and Firefox because this would require the sessions API.
    makeDefaults(settings.globalSettings, "<CS-t>", "default");
    makeDefaults(settings.globalSettings, "<CS-w>", "default");
    // #717: allow passing keys to the browser
    makeDefaults(settings.globalSettings, "ignoreKeys", {});
    // #1050: cursor sometimes covered by command line
    makeDefaults(settings.globalSettings, "cmdlineTimeout", 3000);

    // "alt": "all" | "alphanum"
    // #202: Only register alt key on alphanums to let swedish osx users type
    //       special chars
    // Only tested on OSX, where we don't pull coverage reports, so don't
    // instrument function.
    /* istanbul ignore next */
    if (os === "mac") {
        makeDefaults(settings.globalSettings, "alt", "alphanum");
    } else {
        makeDefaults(settings.globalSettings, "alt", "all");
    }

    makeDefaults(settings, "localSettings", {});
    makeDefaultLocalSetting(settings, ".*", {
        // "cmdline": "neovim" | "firenvim"
        // #168: Use an external commandline to preserve space
        cmdline: "firenvim",
        content: "text",
        priority: 0,
        renderer: "canvas",
        selector: 'textarea:not([readonly]), div[role="textbox"]',
        // "takeover": "always" | "once" | "empty" | "nonempty" | "never"
        // #265: On "once", don't automatically bring back after :q'ing it
        takeover: "always",
    });
    makeDefaultLocalSetting(settings, "about:blank\\?compose", {
        cmdline: "firenvim",
        content: "text",
        priority: 1,
        renderer: "canvas",
        selector: 'body',
        takeover: "always",
    });
    return browser.storage.local.set(settings);
}

function updateSettings() {
    const tmp = preloadedInstance;
    preloadedInstance = createNewInstance();
    tmp.then(nvim => nvim.kill());
    // It's ok to return the preloadedInstance as a promise because
    // settings are only applied when the preloadedInstance has returned a
    // port+settings object anyway.
    return preloadedInstance;
}

function createNewInstance() {
    return new Promise((resolve, reject) => {
        const random = new Uint32Array(8);
        window.crypto.getRandomValues(random);
        const password = Array.from(random).join("");

        const nvim = browser.runtime.connectNative("firenvim");
        const errorTimeout = registerErrors(nvim, reject);
        nvim.onMessage.addListener((resp: any) => {
            (nvim as any).replied = true;
            clearTimeout(errorTimeout);
            checkVersion(resp.version);
            applySettings(resp.settings).finally(() => {
                resolve({
                    kill: () => nvim.disconnect(),
                    password,
                    port: resp.port,
                });
            });
        });
        nvim.postMessage({
            newInstance: true,
            password,
        });
    });
}

// Creating this first instance serves two purposes: make creating new neovim
// frames fast and also initialize settings the first time Firenvim is enabled
// in a browser.
preloadedInstance = createNewInstance();

async function toggleDisabled() {
    const tabid = (await browser.tabs.query({ active: true, currentWindow: true }))[0].id;
    const disabled = !getTabValue(tabid, "disabled");
    setTabValue(tabid, "disabled", disabled);
    updateIcon(tabid);
    return browser.tabs.sendMessage(tabid, { args: [disabled], funcName: ["setDisabled"] });
}

async function acceptCommand (command: string) {
    const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    let p;
    switch (command) {
        case "nvimify":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: [], funcName: ["forceNvimify"] },
        );
        break;
        case "send_C-n":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<C-n>"], funcName: ["sendKey"] },
        );
        if (getGlobalConf()["<C-n>"] === "default") {
            p = p.catch(() => browser.windows.create());
        }
        break;
        case "send_C-t":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<C-t>"], funcName: ["sendKey"] },
        );
        if (getGlobalConf()["<C-t>"] === "default") {
            p = p.catch(() => browser.tabs.create({ "windowId": tab.windowId }));
        }
        break;
        case "send_C-w":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<C-w>"], funcName: ["sendKey"] },
        );
        if (getGlobalConf()["<C-w>"] === "default") {
            p = p.catch(() => browser.tabs.remove(tab.id));
        }
        break;
        case "send_CS-n":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<CS-n>"], funcName: ["sendKey"] },
        );
        if (getGlobalConf()["<CS-n>"] === "default") {
            p = p.catch(() => browser.windows.create({ "incognito": true }));
        }
        break;
        case "send_CS-t":
            // <CS-t> can't be emulated without the sessions API.
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<CS-t>"], funcName: ["sendKey"] },
        );
        break;
        case "send_CS-w":
            p = browser.tabs.sendMessage(
                tab.id,
                { args: ["<CS-w>"], funcName: ["sendKey"] },
        );
        if (getGlobalConf()["<CS-w>"] === "default") {
            p = p.catch(() => browser.windows.remove(tab.windowId));
        }
        break;
        case "toggle_firenvim":
            p = toggleDisabled();
        break;
    }
    return p;
}

Object.assign(window, {
    acceptCommand,
    // We need to stick the browser polyfill in `window` if we want the `exec`
    // call to be able to find it on Chrome
    browser,
    closeOwnTab: (sender: any) => browser.tabs.remove(sender.tab.id),
    exec: (_: any, args: any) => args.funcName.reduce((acc: any, cur: string) => acc[cur], window)(...(args.args)),
    getError,
    getNeovimInstance: () => {
        const result = preloadedInstance;
        preloadedInstance = createNewInstance();
        // Destructuring result to remove kill() from it
        return result.then(({ password, port }) => ({ password, port }));
    },
    getNvimPluginVersion: () => nvimPluginVersion,
    getOwnFrameId: (sender: any) => sender.frameId,
    getTab: (sender: any) => sender.tab,
    getTabValue: (sender: any, args: any) => getTabValue(sender.tab.id, args[0]),
    getTabValueFor: (_: any, args: any) => getTabValue(args[0], args[1]),
    getWarning,
    messageFrame: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id,
                                                                       args.message,
                                                                       { frameId: args.frameId }),
    messagePage: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id,
                                                                      args),
    publishFrameId: (sender: any) => {
        browser.tabs.sendMessage(sender.tab.id, {
            args: [sender.frameId],
            funcName: ["registerNewFrameId"],
        });
        return sender.frameId;
    },
    setTabValue: (sender: any, args: any) => setTabValue(sender.tab.id, args[0], args[1]),
    toggleDisabled: () => toggleDisabled(),
    updateSettings: () => updateSettings(),
} as any);

browser.runtime.onMessage.addListener(async (request: any, sender: any, _sendResponse: any) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    // Can't be tested as there's no way to force an incorrect content request.
    /* istanbul ignore next */
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${JSON.stringify(request)}.`);
    }
    return fn(sender, request.args !== undefined ? request.args : []);
});

browser.tabs.onActivated.addListener(tab => {
    updateIcon(tab.tabId);
});
browser.windows.onFocusChanged.addListener(async (windowId: number) => {
    const tabs = await browser.tabs.query({ active: true, windowId });
    if (tabs.length >= 1) {
        updateIcon(tabs[0].id);
    }
});

updateIcon();

// browser.commmands doesn't exist in thunderbird. Else branch can't be covered
// so don't instrument the if.
/* istanbul ignore next */
if (!isThunderbird()) {
    browser.commands.onCommand.addListener(acceptCommand);
}

async function updateIfPossible() {
    const tabs = await browser.tabs.query({});
    const messages = tabs.map(tab => browser
                                        .tabs
                                        .sendMessage(tab.id,
                                                     {
                                                         args: [],
                                                         funcName: ["getActiveInstanceCount"],
                                                     },
                                                     { frameId: 0 })
                                        .catch(() => 0));
    const instances = await (Promise.all(messages));
    // Can't be covered as reload() would destroy websockets and thus coverage
    // data.
    /* istanbul ignore next */
    if (instances.find(n => n > 0) === undefined) {
        browser.runtime.reload();
    } else {
        setTimeout(updateIfPossible, 1000 * 60 * 10);
    }
}
(window as any).updateIfPossible = updateIfPossible;
browser.runtime.onUpdateAvailable.addListener(updateIfPossible);

// Can't test on the bird of thunder
/* istanbul ignore next */
if (isThunderbird()) {
    // In thunderbird, register the script to be loaded in the compose window
    (browser as any).composeScripts.register({
        js: [{file: "compose.js"}],
    });
}
