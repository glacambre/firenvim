
// Background-only actions. Passed in by testing/background.ts; testing/content
// and testing/frame omit the parameter, since the request types that need
// these (updateSettings/tryUpdate/acceptCommand) are only ever sent to the
// background context.
export type BackgroundActions = {
    updateSettings: () => Promise<unknown>;
    updateIfPossible: () => Promise<unknown>;
    acceptCommand: (command: string) => Promise<unknown>;
};

const requests = new Map();

let reqId = 0;
// No reason to make requests for now.
/* istanbul ignore next */
export function makeRequest(socket: any, func: string, args?: any[]): any {
    return new Promise(resolve => {
        reqId += 1;
        requests.set(reqId, resolve);
        socket.send(JSON.stringify({ reqId, funcName: [func], args }));
    });
}

export function makeRequestHandler(s: any, context: string, coverageData: any, actions?: BackgroundActions) {
    return async (m: any) => {
        const req = JSON.parse(m.data);
        const resolve = (args: any[]) => s.send(JSON.stringify({
            args,
            funcName: ["resolve"],
            reqId: req.reqId,
        }));
        const reject = (e: any) => s.send(JSON.stringify({
            args: [{
                message: e.message,
                cause: req.funcName[0],
                name: e.name,
                fileName: e.fileName,
                lineNumber: e.lineNumber,
                columnNumber: e.columnNumber,
                stack: e.stack,
            }],
            funcName: ["reject"],
            reqId: req.reqId,
        }));
        switch(req.funcName[0]) {
            // Ignoring the resolve case because the browser has no reason to
            // send requests to the coverage server for now.
            /* istanbul ignore next */
            case "resolve": {
                const r = requests.get(req.reqId);
                if (r !== undefined) {
                    r(...req.args);
                } else {
                    console.error("Received answer to unsent request!", req);
                }
            }
            break;
            case "getContext":
                s.send(JSON.stringify({
                    args: [context],
                    funcName: ["resolve"],
                    reqId: req.reqId,
                }));
                break;
            case "getCoverageData":
                s.send(JSON.stringify({
                    args: [JSON.stringify(coverageData)],
                    funcName: ["resolve"],
                    reqId: req.reqId,
                }));
                // Ignoring this break because it's tested but cov data is sent
                // before.
                /* istanbul ignore next */
                break;
            case "updateSettings":
                actions.updateSettings().finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "tryUpdate":
                actions.updateIfPossible().finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "acceptCommand":
                actions.acceptCommand(req.args[0]).finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "closeExtraWindows":
                try {
                    const wins = await browser.windows.getAll();
                    await Promise.all(wins.slice(1).map(w => browser.windows.remove(w.id)));
                    resolve([]);
                } catch (e) {
                    reject(e);
                }
                break;
            case "getWindowCount":
                try {
                    const wins = await browser.windows.getAll({});
                    resolve([wins.length]);
                } catch (e) {
                    reject(e);
                }
                break;
            case "getTabCount":
                try {
                    const tabs = await browser.tabs.query({});
                    resolve([tabs.length]);
                } catch (e) {
                    reject(e);
                }
                break;
            case "dispatchUntrustedKeyhandlerInput":
                try {
                    const target = document.getElementById("keyhandler") as HTMLInputElement;
                    target.value = "a";
                    [
                        new KeyboardEvent("keydown",  { key: "a", bubbles: true }),
                        new KeyboardEvent("keyup",    { key: "a", bubbles: true }),
                        new KeyboardEvent("keypress", { key: "a", bubbles: true }),
                        new InputEvent("beforeinput", { data: "a", bubbles: true }),
                        new InputEvent("input",       { data: "a", bubbles: true }),
                        new InputEvent("change",      { data: "a", bubbles: true }),
                        new KeyboardEvent("keydown",  { key: "a", ctrlKey: true, bubbles: true }),
                        new KeyboardEvent("keyup",    { key: "a", ctrlKey: true, bubbles: true }),
                        new KeyboardEvent("keypress", { key: "a", ctrlKey: true, bubbles: true }),
                    ].forEach(e => target.dispatchEvent(e));
                    target.value = "";
                    resolve([]);
                } catch (e) {
                    reject(e);
                }
                break;
        }
    };
}
