
const requests = new Map();

export function makeRequest(socket: any, func: string, args?: any[]): any {
    return new Promise(resolve => {
        let reqId = Math.random();
        while (requests.get(reqId) !== undefined) {
            reqId = Math.random();
        }
        requests.set(reqId, resolve);
        socket.send(JSON.stringify({ reqId, funcName: [func], args }));
    });
}

export function makeRequestHandler(s: any, context: string, coverageData: any) {
    return (m: any) => {
        const req = JSON.parse(m.data);
        switch(req.funcName[0]) {
            case "resolve":
                const r = requests.get(req.reqId);
                if (r !== undefined) {
                    r(...req.args);
                } else {
                    console.error("Received answer to unsent request!", req);
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
            case "toggleFirenvim":
                (window as any).acceptCommand("toggle_firenvim").finally(() => {
                    s.send(JSON.stringify({
                        args: [],
                        funcName: ["resolve"],
                        reqId: req.reqId,
                    }));
                });
                break;
        }
    };
}
