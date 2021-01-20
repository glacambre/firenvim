import * as fs from "fs";
import * as path from "path";
import { Server } from "ws";
import * as istanbul from "istanbul-lib-coverage";

const requests = new Map();

function makeRequest(socket: any, func: string, args?: any[]): any {
        return new Promise(resolve => {
                let reqId = Math.random();
                while (requests.get(reqId) !== undefined) {
                        reqId = Math.random();
                }
                requests.set(reqId, resolve);
                socket.send(JSON.stringify({ reqId, funcName: [func], args }));
        });
}

function makeRequestHandler(s: any) {
        return function (m: any) {
                const req = JSON.parse(m.toString());
                switch(req.funcName[0]) {
                        case "resolve":
                                const r = requests.get(req.reqId);
                                if (r !== undefined) {
                                        r(...req.args);
                                } else {
                                        console.error("Received answer to unsent request!", req);
                                }
                        break;
                        case "pushCoverage":
                                saveCoverageData(req.args[0]);
                                s.send(JSON.stringify({
                                        args: [],
                                        funcName: ["resolve"],
                                        reqId: req.reqId,
                                }));
                        break;
                }
        }
}

let server : Server = undefined;
let backgroundSocket : Promise<any> = undefined;
let coverage_dir : string = undefined;
const connectionResolves : any[] = [];
export function start(port: number, path: string) {
        coverage_dir = path;
        server = new Server({ host: "127.0.0.1", port });
        server.on("connection", s => {
                console.log("new conn");
                s.on("message", makeRequestHandler(s))
                console.log("resolving ", connectionResolves.length, " promises");
                connectionResolves.forEach(r => r(s));
                connectionResolves.length = 0;
        });
        backgroundSocket = getNextBackgroundConnection();
        return server;
}


// Returns a promise that resolves once a websocket is created
export function getNextConnection () {
        return new Promise((resolve) => {
                console.log("getNextConnection called, pushing promise...");
                connectionResolves.push(resolve);
        });
}

// Returns a function that returns a promise that resolves once an object with
// an attribute named kind and whose value matches X is returned.
function getNextXConnection (X: "content" | "frame" | "background") {
        return async function () {
                console.log("a");
                let isX: boolean;
                console.log("b");
                let socket : any;
                console.log("c");
                do {
                        console.log("d");
                        socket = await getNextConnection();
                        console.log("e");
                        const context = await makeRequest(socket, "getContext");
                        console.log("f", context);
                        isX = context === X;
                        console.log("g");
                } while (!isX);
                console.log("h");
                return (socket);
        }
}

export const getNextBackgroundConnection = getNextXConnection("background");
export const getNextFrameConnection = getNextXConnection("frame");
export const getNextContentConnection = getNextXConnection("content");

const covMap = istanbul.createCoverageMap({});
function saveCoverageData(coverageData: string) {
        const data = coverageData.replace(/webpack:\/\/Firenvim\/./g, process.cwd().replace("\\", "/"));
        covMap.merge(JSON.parse(data));
}

export async function pullCoverageData (ws: any) {
        saveCoverageData(await makeRequest(ws, "getCoverageData"));
}

export function updateSettings () {
        return backgroundSocket.then((s : any) => makeRequest(s, "updateSettings"));
};

export function shutdown () {
        fs.writeFileSync(path.join(coverage_dir, "results"),
                         JSON.stringify(covMap));
        return new Promise((resolve) => server.close(resolve));
}
