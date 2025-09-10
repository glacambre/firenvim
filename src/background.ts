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
import { getGlobalConf, mergeWithDefaults } from "./utils/configuration";
import { getIconImageData, IconKind } from "./utils/utils";
import { MessageType, Message } from "./MessageTypes";

export let preloadedInstance: Promise<any>;

type tabId = number;
type tabStorage = {
    disabled: boolean,
};
// V3 Migration: Replace in-memory Map with chrome.storage.session
async function setTabValue(tabid: tabId, item: keyof tabStorage, value: any) {
    const key = `tab_${tabid}_${item}`;
    await browser.storage.session.set({ [key]: value });
}

async function getTabValue(tabid: tabId, item: keyof tabStorage) {
    const key = `tab_${tabid}_${item}`;
    const result = await browser.storage.session.get(key);
    return result[key];
}

async function updateIcon(tabid?: number) {
    let name: IconKind = "normal";
    if (tabid === undefined) {
        const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        if (tab === undefined) {
            console.warn("Current tab is undefined - failing to updateIcon()");
            return;
        }
        tabid = tab.id;
    }
    if ((await getTabValue(tabid, "disabled")) === true) {
        name = "disabled";
    } else if (error !== "") {
        name = "error";
    } else if (warning !== "") {
        name = "notification";
    }
    return getIconImageData(name).then((imageData: any) => browser.browserAction.setIcon({ imageData }));
}

// V3 Migration: Replace global variables with chrome.storage.session
async function setOs(osValue: string) {
    await browser.storage.session.set({ os: osValue });
}

async function getOs(): Promise<string> {
    const result = await browser.storage.session.get('os');
    return result.os || '';
}

// Initialize OS value
browser.runtime.getPlatformInfo().then((plat: any) => setOs(plat.os));

async function setError(errorMsg: string) {
    await browser.storage.session.set({ error: errorMsg });
}

async function getError(): Promise<string> {
    const result = await browser.storage.session.get('error');
    return result.error || '';
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

async function setWarning(warningMsg: string) {
    await browser.storage.session.set({ warning: warningMsg });
}

async function getWarning(): Promise<string> {
    const result = await browser.storage.session.get('warning');
    return result.warning || '';
}

async function setNvimPluginVersion(version: string) {
    await browser.storage.session.set({ nvimPluginVersion: version });
}

async function getNvimPluginVersion(): Promise<string> {
    const result = await browser.storage.session.get('nvimPluginVersion');
    return result.nvimPluginVersion || '';
}
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
function warnUnexpectedMessages(messages: string[]) {
    if (messages === undefined || !Array.isArray(messages) || messages.length < 1) {
        return;
    }
    warning = messages.join("\n");
    updateIcon();
}

// Function called in order to fill out default settings. Called from updateSettings.
function applySettings(settings: any) {
    return browser.storage.local.set(mergeWithDefaults(os, settings) as any);
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
            warnUnexpectedMessages(resp.messages);
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
    const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab === undefined) {
        console.warn("Current tab is undefined - failing to toggleDisabled()");
        return;
    }
    const tabid = tab.id;
    const disabled = !(await getTabValue(tabid, "disabled"));
    await setTabValue(tabid, "disabled", disabled);
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

// Message handlers for V3 migration - only background script functions
const messageHandlers: Record<string, (sender: any, args: any[]) => any> = {
  [MessageType.ACCEPT_COMMAND]: (_: any, args: any[]) => acceptCommand(args[0]),
  [MessageType.CLOSE_OWN_TAB]: (sender: any, _: any[]) => browser.tabs.remove(sender.tab.id),
  [MessageType.GET_ERROR]: (_: any, _args: any[]) => getError(),
  [MessageType.GET_NEOVIM_INSTANCE]: (_: any, _args: any[]) => {
    const result = preloadedInstance;
    preloadedInstance = createNewInstance();
    return result.then(({ password, port }) => ({ password, port }));
  },
  [MessageType.GET_NVIM_PLUGIN_VERSION]: (_: any, _args: any[]) => nvimPluginVersion,
  [MessageType.GET_OWN_FRAME_ID]: (sender: any, _: any[]) => sender.frameId,
  [MessageType.GET_TAB]: (sender: any, _: any[]) => sender.tab,
  [MessageType.GET_TAB_VALUE]: async (sender: any, args: any[]) => await getTabValue(sender.tab.id, args[0]),
  [MessageType.GET_TAB_VALUE_FOR]: async (_: any, args: any[]) => await getTabValue(args[0], args[1]),
  [MessageType.GET_WARNING]: (_: any, _args: any[]) => getWarning(),
  [MessageType.MESSAGE_FRAME]: (sender: any, args: any[]) => browser.tabs.sendMessage(sender.tab.id, args[0].message, { frameId: args[0].frameId }),
  [MessageType.MESSAGE_PAGE]: (sender: any, args: any[]) => browser.tabs.sendMessage(sender.tab.id, args[0]),
  [MessageType.PUBLISH_FRAME_ID]: (sender: any, _: any[]) => {
    browser.tabs.sendMessage(sender.tab.id, {
      args: [sender.frameId],
      funcName: ["registerNewFrameId"],
    });
    return sender.frameId;
  },
  [MessageType.SET_TAB_VALUE]: (sender: any, args: any[]) => setTabValue(sender.tab.id, args[0], args[1]),
  [MessageType.TOGGLE_DISABLED]: (_: any, _args: any[]) => toggleDisabled(),
  [MessageType.UPDATE_SETTINGS]: (_: any, _args: any[]) => updateSettings(),
  [MessageType.OPEN_TROUBLESHOOTING_GUIDE]: (_: any, _args: any[]) => browser.tabs.create({ active: true, url: "https://github.com/glacambre/firenvim/blob/master/TROUBLESHOOTING.md" }),
};

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
    openTroubleshootingGuide: () => browser.tabs.create({ active: true, url: "https://github.com/glacambre/firenvim/blob/master/TROUBLESHOOTING.md" }),
} as any);

browser.runtime.onMessage.addListener(async (request: any, sender: any, _sendResponse: any) => {
    // V3 Migration: Use explicit message handlers instead of exec()
    if (request.type && request.type in messageHandlers) {
        return messageHandlers[request.type as MessageType](sender, request.args || []);
    }
    
    // Legacy support during migration
    if (request.funcName) {
        const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
        if (!fn) {
            throw new Error(`Error: unhandled content request: ${JSON.stringify(request)}.`);
        }
        return fn(sender, request.args !== undefined ? request.args : []);
    }
    
    throw new Error(`Error: unhandled message: ${JSON.stringify(request)}.`);
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

browser.commands.onCommand.addListener(acceptCommand);
browser.runtime.onMessageExternal.addListener(async (request: any, sender: any, _sendResponse: any) => {
    const resp = await acceptCommand(request.command);
    _sendResponse(resp);
});

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
