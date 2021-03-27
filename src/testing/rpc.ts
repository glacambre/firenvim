
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

export function makeRequestHandler(s: any, context: string, coverageData: any) {
    return (m: any) => {
        const req = JSON.parse(m.data);
        switch(req.funcName[0]) {
            // Ignoring the resolve case because the browser has no reason to
            // send requests to the coverage server for now.
            /* istanbul ignore next */
            case "resolve":
                {
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
                (window as any).updateSettings().finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "tryUpdate":
                (window as any).updateIfPossible().finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "acceptCommand":
                (window as any).acceptCommand(...req.args).finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
            case "eval":
                Promise.resolve(eval(req.args[0])).catch(() => undefined).then((result) => {
                    s.send(JSON.stringify({
                        args: [result],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
        }
    };
}
