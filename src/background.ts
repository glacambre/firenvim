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
import { IconKind } from "./utils/utils";
import { MessageType, Message } from "./MessageTypes";

const iconPaths: Record<IconKind, string> = {
    normal: "firenvim128.png",
    disabled: "firenvim128.png", // Could use a different static icon
    error: "firenvim128.png",    // Could use a different static icon
    notification: "firenvim128.png" // Could use a different static icon
};


type tabId = number;
type tabStorage = {
    disabled: boolean,
};
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
    } else if ((await getError()) !== "") {
        name = "error";
    } else if ((await getWarning()) !== "") {
        name = "notification";
    }

    // Cross-browser compatibility: Firefox uses browserAction, Chrome uses action
    const iconAPI = browser.action || browser.browserAction;
    return iconAPI.setIcon({ path: iconPaths[name] });
}

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
    setError("");
    const timeout = setTimeout(() => {
        nvim.timedOut = true;
        setError("Neovim is not responding.");
        updateIcon();
        nvim.disconnect();
        reject("Neovim is not responding.");
    }, 10000);
    nvim.onDisconnect.addListener(async (p: any) => {
        clearTimeout(timeout);
        updateIcon();

        if (browser.runtime.lastError) {
            console.debug("Native host disconnected:", browser.runtime.lastError.message);
        }

        // Unfortunately this error handling can't be tested as it requires
        // side-effects on the OS.
        /* istanbul ignore next */
        if (p.error) {
            const errstr = p.error.toString();
            let errorMsg = "";
            if (errstr.match(/no such native application/i)) {
                errorMsg = "Native manifest not found. Please run `:call firenvim#install(0)` in neovim.";
            } else if (errstr.match(/an unexpected error occurred/i)) {
                errorMsg = "The script supposed to start neovim couldn't be found."
                    + " Please run `:call firenvim#install(0)` in neovim";
                if ((await getOs()) === "win") {
                    errorMsg += " or try running the scripts in %LOCALAPPDATA%\\firenvim\\";
                }
                errorMsg += ".";
            } else if (errstr.match(/Native application tried to send a message of/)) {
                errorMsg = "Unexpected output. Run `nvim --headless` and ensure it prints nothing.";
            } else {
                errorMsg = errstr;
            }
            await setError(errorMsg);
            updateIcon();
            reject(p.error);
        } else if (!nvim.replied && !nvim.timedOut) {
            await setError("Neovim died without answering.");
            updateIcon();
            reject("Neovim died without answering.");
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
    await setNvimPluginVersion(nvimVersion);
    const manifest = browser.runtime.getManifest();
    await setWarning("");
    // Can't be tested as it would require side effects on the OS.
    /* istanbul ignore next */
    if (manifest.version !== nvimVersion) {
        await setWarning(`Neovim plugin version (${nvimVersion}) and browser addon `
            + `version (${manifest.version}) do not match.`);
    }
    updateIcon();
}
async function warnUnexpectedMessages(messages: string[]) {
    if (messages === undefined || !Array.isArray(messages) || messages.length < 1) {
        return;
    }
    await setWarning(messages.join("\n"));
    updateIcon();
}

// Function called in order to fill out default settings. Called from updateSettings.
async function applySettings(settings: any) {
    const os = await getOs();
    return browser.storage.local.set(mergeWithDefaults(os, settings) as any);
}

function updateSettings() {
    // Settings are applied when new instances are created on-demand
    return Promise.resolve();
}

function createNewInstance() {
    return new Promise((resolve, reject) => {
        const random = new Uint32Array(8);
        crypto.getRandomValues(random);
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

async function initializeSettings() {
    try {
        // Check if settings already exist
        const existing = await browser.storage.local.get();
        if (Object.keys(existing).length === 0) {
            // No settings exist, apply defaults
            const os = await getOs();
            await browser.storage.local.set(mergeWithDefaults(os, {}) as any);
        }
    } catch (error) {
        console.warn("Failed to initialize settings:", error);
    }
}

// Initialize settings on service worker startup
initializeSettings();

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
    return browser.tabs.sendMessage(tabid, {
        type: MessageType.MESSAGE_PAGE,
        args: [{ args: [disabled], funcName: ["setDisabled"] }]
    });
}

async function acceptCommand (command: string) {
    const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    let p;
    switch (command) {
        case "nvimify":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: [], funcName: ["forceNvimify"] }]
                },
        );
        break;
        case "send_C-n":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<C-n>"], funcName: ["sendKey"] }]
                },
        );
        if (getGlobalConf()["<C-n>"] === "default") {
            p = p.catch(() => browser.windows.create());
        }
        break;
        case "send_C-t":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<C-t>"], funcName: ["sendKey"] }]
                },
        );
        if (getGlobalConf()["<C-t>"] === "default") {
            p = p.catch(() => browser.tabs.create({ "windowId": tab.windowId }));
        }
        break;
        case "send_C-w":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<C-w>"], funcName: ["sendKey"] }]
                },
        );
        if (getGlobalConf()["<C-w>"] === "default") {
            p = p.catch(() => browser.tabs.remove(tab.id));
        }
        break;
        case "send_CS-n":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<CS-n>"], funcName: ["sendKey"] }]
                },
        );
        if (getGlobalConf()["<CS-n>"] === "default") {
            p = p.catch(() => browser.windows.create({ "incognito": true }));
        }
        break;
        case "send_CS-t":
            // <CS-t> can't be emulated without the sessions API.
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<CS-t>"], funcName: ["sendKey"] }]
                },
        );
        break;
        case "send_CS-w":
            p = browser.tabs.sendMessage(
                tab.id,
                {
                    type: MessageType.MESSAGE_PAGE,
                    args: [{ args: ["<CS-w>"], funcName: ["sendKey"] }]
                },
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
  [MessageType.GET_MANIFEST]: (_: any, _args: any[]) => browser.runtime.getManifest(),
  [MessageType.GET_NEOVIM_INSTANCE]: (_: any, _args: any[]) => {
    return createNewInstance().then(({ password, port }) => ({ password, port }));
  },
  [MessageType.GET_NVIM_PLUGIN_VERSION]: async (_: any, _args: any[]) => await getNvimPluginVersion(),
  [MessageType.GET_OWN_FRAME_ID]: (sender: any, _: any[]) => sender.frameId,
  [MessageType.GET_PLATFORM_INFO]: (_: any, _args: any[]) => browser.runtime.getPlatformInfo(),
  [MessageType.GET_TAB]: (sender: any, _: any[]) => sender.tab,
  [MessageType.GET_TAB_VALUE]: async (sender: any, args: any[]) => await getTabValue(sender.tab.id, args[0]),
  [MessageType.GET_TAB_VALUE_FOR]: async (_: any, args: any[]) => await getTabValue(args[0], args[1]),
  [MessageType.GET_WARNING]: (_: any, _args: any[]) => getWarning(),
  [MessageType.MESSAGE_FRAME]: (sender: any, args: any[]) => browser.tabs.sendMessage(sender.tab.id, args[0].message, { frameId: args[0].frameId }),
  [MessageType.MESSAGE_PAGE]: (sender: any, args: any[]) => browser.tabs.sendMessage(sender.tab.id, args[0]),
  [MessageType.PUBLISH_FRAME_ID]: (sender: any, _: any[]) => {
    browser.tabs.sendMessage(sender.tab.id, {
      type: MessageType.MESSAGE_PAGE,
      args: [{ args: [sender.frameId], funcName: ["registerNewFrameId"] }]
    });
    return sender.frameId;
  },
  [MessageType.SET_LAST_FOCUSED_CONTENT_SCRIPT]: (sender: any, args: any[]) => {
    // Store which content script is focused - for now just log it
    // In the future this could be stored in session storage if needed
    console.debug("Content script focused:", sender.tab.id, "frame:", args[0]);
  },
  [MessageType.SET_TAB_VALUE]: (sender: any, args: any[]) => setTabValue(sender.tab.id, args[0], args[1]),
  [MessageType.TOGGLE_DISABLED]: (_: any, _args: any[]) => toggleDisabled(),
  [MessageType.UPDATE_SETTINGS]: (_: any, _args: any[]) => updateSettings(),
  [MessageType.OPEN_TROUBLESHOOTING_GUIDE]: (_: any, _args: any[]) => browser.tabs.create({ active: true, url: "https://github.com/glacambre/firenvim/blob/master/TROUBLESHOOTING.md" }),
};

// Legacy functions are now handled by messageHandlers map

browser.runtime.onMessage.addListener(async (request: any, sender: any, _sendResponse: any) => {
    if (request.type && request.type in messageHandlers) {
        return messageHandlers[request.type as MessageType](sender, request.args || []);
    }

    // Legacy support during migration - funcName calls should use messageHandlers
    if (request.funcName) {
        throw new Error(`Legacy funcName calls not supported in service worker: ${JSON.stringify(request)}. Use MessageType instead.`);
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
                                                         type: MessageType.MESSAGE_PAGE,
                                                         args: [{ args: [], funcName: ["getActiveInstanceCount"] }]
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
browser.runtime.onUpdateAvailable.addListener(updateIfPossible);
