
browser.runtime.onConnect.addListener((port: Port) => {
    const nvim = browser.runtime.connectNative("firenvim");
    nvim.onMessage.addListener((msg: any) => port.postMessage(msg));
    nvim.onDisconnect.addListener((msg: any) => port.disconnect(msg));
    port.onMessage.addListener((msg: any) => nvim.postMessage(msg));
    port.onDisconnect.addListener((msg: any) => nvim.disconnect(msg));
});
