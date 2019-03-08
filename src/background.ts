
browser.runtime.onConnect.addListener((port: browser.runtime.Port) => {
    const nvim = browser.runtime.connectNative("firenvim");
    nvim.onMessage.addListener((msg: any) => port.postMessage(msg));
    nvim.onDisconnect.addListener((msg: any) => port.disconnect());
    port.onMessage.addListener((msg: any) => nvim.postMessage(msg));
    port.onDisconnect.addListener((msg: any) => nvim.disconnect());
});

const functions: any = {
    getTab: (sender: any, args: any) => sender.tab,
    messageOwnTab: (sender: any, args: any) => browser.tabs.sendMessage(sender.tab.id, args),
};

browser.runtime.onMessage.addListener(async (request: any, sender: any, sendResponse: any) => {
    if (!functions[request.function]) {
        throw new Error(`Error: unhandled content request: ${request.toString()}.`);
    }
    return functions[request.function](sender, request.args || []);
});
