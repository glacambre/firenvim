
browser.runtime.onConnect.addListener((port: browser.runtime.Port) => {
    const nvim = browser.runtime.connectNative("firenvim");
    nvim.onMessage.addListener((msg: any) => port.postMessage(msg));
    nvim.onDisconnect.addListener((msg: any) => port.disconnect());
    port.onMessage.addListener((msg: any) => nvim.postMessage(msg));
    port.onDisconnect.addListener((msg: any) => nvim.disconnect());
});

Object.assign(window, {
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
