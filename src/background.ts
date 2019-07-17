
function createNewInstance() {
    return new Promise(resolve => {
        const password = new Uint32Array(1);
        window.crypto.getRandomValues(password);

        const nvim = browser.runtime.connectNative("firenvim");
        nvim.onMessage.addListener(port => resolve({ password: password[0], port }));
        nvim.postMessage({
            origin: browser.runtime.getURL("").slice(0, -1),
            password: password[0],
        });
    });
}

let preloadedInstance = createNewInstance();

Object.assign(window, {
    getNewNeovimInstance: (sender: any, args: any) => {
        const result = preloadedInstance;
        preloadedInstance = createNewInstance();
        return result;
    },
    getTab: (sender: any, args: any) => sender.tab,
    messageOwnTab: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id, args),
} as any);

browser.runtime.onMessage.addListener(async (request: any, sender: any, sendResponse: any) => {
    const fn = request.funcName.reduce((acc: any, cur: string) => acc[cur], window);
    if (!fn) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return fn(sender, request.args || []);
});

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        browser.storage.sync.set({
            blacklist: "example\\.{com,net,org}",
            elements: ".* textarea",
        });
    }
});
