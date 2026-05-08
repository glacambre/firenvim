/**
 * Browser extensions have multiple processes. This is the entry point for the
 * [background process](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Anatomy_of_a_WebExtension#Background_scripts).
 * Our background process has multiple tasks:
 * - Keep track of per-tab values with its setTabValue/getTabValue functions
 * - Set the [browserActions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction)'s icon.
 * - Keep track of error messages/warnings that should are displayed in the
 *   browserAction.
 * - Update settings when the user changes their vimrc.
 * - Start new Neovim instances when asked by a content script.
 * - Provide an RPC mechanism that enables calling background APIs from the
 *   browserAction/content script.
 *
 * The background process mostly acts as a slave for the browserAction and
 * content scripts. It rarely acts on its own.
 */
import { getGlobalConf, mergeWithDefaults } from "./utils/configuration";
import { editorClasses } from "./editor-adapter/rpc";

type IconKind = "normal" | "disabled" | "error" | "notification";

function iconPath(kind: IconKind) {
    const prefix = kind === "normal" ? "firenvim" : `firenvim-${kind}`;
    return {
        16: `${prefix}16.png`,
        48: `${prefix}48.png`,
        128: `${prefix}128.png`,
    };
}

type tabId = number;
type tabStorage = {
    disabled: boolean,
};
// Per-tab state lives in storage.session so it survives MV3 service-worker
// suspension within a browser session. One key per tab; cleared on tab close.
const tabKey = (tabid: tabId) => `tab:${tabid}`;
async function setTabValue(tabid: tabId, item: keyof tabStorage, value: any) {
    const key = tabKey(tabid);
    const obj: tabStorage = (await browser.storage.session.get(key))[key]
        || { disabled: false };
    obj[item] = value;
    await browser.storage.session.set({ [key]: obj });
}
async function getTabValue(tabid: tabId, item: keyof tabStorage) {
    const key = tabKey(tabid);
    const obj: tabStorage | undefined = (await browser.storage.session.get(key))[key];
    if (obj === undefined) {
        return undefined;
    }
    return obj[item];
}
browser.tabs.onRemoved.addListener(tabid => {
    browser.storage.session.remove(tabKey(tabid));
});

// Background-wide ephemeral state. Lives in storage.session so it survives
// MV3 service-worker suspension within a browser session.
type bgStorage = {
    error: string,
    warning: string,
    nvimPluginVersion: string,
};
const bgKey = "bg";
const emptyBgState: bgStorage = { error: "", warning: "", nvimPluginVersion: "" };
async function getBgState(): Promise<bgStorage> {
    const obj: bgStorage | undefined = (await browser.storage.session.get(bgKey))[bgKey];
    return obj || emptyBgState;
}
async function patchBgState(patch: Partial<bgStorage>): Promise<bgStorage> {
    const next = Object.assign(await getBgState(), patch);
    await browser.storage.session.set({ [bgKey]: next });
    return next;
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
    const state = await getBgState();
    if ((await getTabValue(tabid, "disabled")) === true) {
        name = "disabled";
    } else if (state.error !== "") {
        name = "error";
    } else if (state.warning !== "") {
        name = "notification";
    }
    const action = (browser as any).action || browser.browserAction;
    return action.setIcon({ path: iconPath(name) });
}

// Os is win/mac/linux/androis/cros.
let osPromise: Promise<string> | undefined;
function getOs(): Promise<string> {
    if (osPromise === undefined) {
        osPromise = browser.runtime.getPlatformInfo().then((plat: any) => plat.os);
    }
    return osPromise;
}

// Simple getter for easy RPC calls. Can't be tested as requires opening
// the action popup.
/* istanbul ignore next */
async function getError() {
    return (await getBgState()).error;
}

function registerErrors(nvim: any, reject: any) {
    patchBgState({ error: "" });
    const timeout = setTimeout(async () => {
        nvim.timedOut = true;
        const msg = "Neovim is not responding.";
        await patchBgState({ error: msg });
        updateIcon();
        nvim.disconnect();
        reject(msg);
    }, 10000);
    nvim.onDisconnect.addListener(async (p: any) => {
        clearTimeout(timeout);
        // Unfortunately this error handling can't be tested as it requires
        // side-effects on the OS.
        /* istanbul ignore next */
        if (p.error) {
            const errstr = p.error.toString();
            let msg: string;
            if (errstr.match(/no such native application/i)) {
                msg = "Native manifest not found. Please run `:call firenvim#install(0)` in Neovim.";
            } else if (errstr.match(/an unexpected error occurred/i)) {
                msg = "The script supposed to start Neovim couldn't be found."
                    + " Please run `:call firenvim#install(0)` in Neovim";
                if ((await getOs()) === "win") {
                    msg += " or try running the scripts in %LOCALAPPDATA%\\firenvim\\";
                }
                msg += ".";
            } else if (errstr.match(/Native application tried to send a message of/)) {
                msg = "Unexpected output. Run `nvim --headless` and ensure it prints nothing.";
            } else {
                msg = errstr;
            }
            await patchBgState({ error: msg });
            updateIcon();
            reject(p.error);
        } else if (!nvim.replied && !nvim.timedOut) {
            const msg = "Neovim died without answering.";
            await patchBgState({ error: msg });
            updateIcon();
            reject(msg);
        } else {
            updateIcon();
        }
    });
    return timeout;
}

/* istanbul ignore next */
async function getWarning() {
    return (await getBgState()).warning;
}
async function getNvimPluginVersion() {
    return (await getBgState()).nvimPluginVersion;
}
async function checkVersion(nvimVersion: string) {
    const manifest = browser.runtime.getManifest();
    let warning = "";
    // Can't be tested as it would require side effects on the OS.
    /* istanbul ignore next */
    if (manifest.version !== nvimVersion) {
        warning = `Neovim plugin version (${nvimVersion}) and browser addon `
            + `version (${manifest.version}) do not match.`;
    }
    await patchBgState({ nvimPluginVersion: nvimVersion, warning });
    updateIcon();
}
async function warnUnexpectedMessages(messages: string[]) {
    if (messages === undefined || !Array.isArray(messages) || messages.length < 1) {
        return;
    }
    await patchBgState({ warning: messages.join("\n") });
    updateIcon();
}

// Function called in order to fill out default settings. Called from updateSettings.
async function applySettings(settings: any) {
    return browser.storage.local.set(mergeWithDefaults(await getOs(), settings) as any);
}

// One-shot connection: spawn a Neovim instance just long enough to receive
// settings, apply them to storage.local, then disconnect. Called from init()
// on install/startup and from the popup's "reload settings" button.
export async function updateSettings() {
    const nvim = await createNewInstance();
    nvim.kill();
}

function createNewInstance(): Promise<{ kill: () => void; password: string; port: number }> {
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

export async function acceptCommand (command: string) {
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

const handlers: { [name: string]: (sender: any, args: any) => any } = {
    closeOwnTab: (sender: any) => browser.tabs.remove(sender.tab.id),
    editor: async (sender: any, args: any) => {
        const clazz = editorClasses[args.className as keyof typeof editorClasses];
        if (clazz === undefined) {
            throw new Error(`Unknown editor class: ${args.className}`);
        }
        const proc = Object.hasOwn(clazz, args.procName) ? (clazz as any)[args.procName] : undefined;
        if (typeof proc !== "function") {
            throw new Error(`Unknown procedure ${args.procName} on ${args.className}`);
        }
        const results = await browser.scripting.executeScript({
            target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
            func: proc as any,
            args: args.procArgs,
            world: "MAIN" as any,
        });
        let err = results.find(r => r.error !== undefined);
        if (err !== undefined) {
            throw err.error;
        }
        return results[0]?.result;
    },
    getError: () => getError(),
    getNeovimInstance: () => createNewInstance()
        // Drop kill() — the native port stays open for the editor's lifetime
        // and is torn down when the native host disconnects.
        .then(({ password, port }) => ({ password, port })),
    getNvimPluginVersion: () => getNvimPluginVersion(),
    getPlatformInfo: () => browser.runtime.getPlatformInfo(),
    getOwnFrameId: (sender: any) => sender.frameId,
    getTab: (sender: any) => sender.tab,
    getTabValue: (sender: any, args: any) => getTabValue(sender.tab.id, args[0]),
    getTabValueFor: (_: any, args: any) => getTabValue(args[0], args[1]),
    getWarning: () => getWarning(),
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
};

browser.runtime.onMessage.addListener(async (request: any, sender: any, _sendResponse: any) => {
    const fn = handlers[request.funcName[0]];
    // Can't be tested as there's no way to force an incorrect content request.
    /* istanbul ignore next */
    if (!fn || request.funcName.length !== 1) {
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

// Runs once per browser session: on extension install and on browser start.
// Fetches default settings from Neovim into storage.local; the per-editor
// instances are created on demand by getNeovimInstance.
function init() {
    updateSettings();
    updateIcon();
}
browser.runtime.onInstalled.addListener(init);
browser.runtime.onStartup.addListener(init);

browser.commands.onCommand.addListener(acceptCommand);
browser.runtime.onMessageExternal.addListener(async (request: any) => {
    // Await for an explicit backtrace in the background script's console
    return await acceptCommand(request.command);
});

const UPDATE_CHECK_ALARM = "firenvim-update-check";

export async function updateIfPossible() {
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
        browser.alarms.create(UPDATE_CHECK_ALARM, { delayInMinutes: 10 });
    }
}
browser.runtime.onUpdateAvailable.addListener(updateIfPossible);
browser.alarms.onAlarm.addListener((alarm: any) => {
    if (alarm.name === UPDATE_CHECK_ALARM) {
        updateIfPossible();
    }
});
