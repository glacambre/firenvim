// This script is only loaded in firefox-testing and chrome-testing builds
// (check manifest.json). It lets selenium know that Firenvim is ready to
// receive events by connecting to the coverage server through a websocket.
// Once connected, it can decide to push coverage information
import { makeRequest, makeRequestHandler } from "./rpc";

// Of course we have to ignore the case where
// coverage data doesn't exist.
const coverageData = (window as any).__coverage__ || /* istanbul ignore next */ {};

let socket: WebSocket;
function createSocket(): Promise<WebSocket> {
    socket = new WebSocket('ws://127.0.0.1:12345');
    socket.addEventListener('message', makeRequestHandler(socket, "frame", coverageData));
    return new Promise(resolve => socket.addEventListener("open", () => resolve(socket)));
}

import { isReady } from "../frame";
import { PageType } from "../page";

isReady.then((page: PageType) => {
    page.killEditor = (f => async () => {
        if (socket === undefined) {
            // socket is undefined if isReady failed - this happens with the buggy
            // vimrc testcase. We still want coverage data when this happens so we
            // create the socket and push cov data immediately
            socket = await createSocket();
        }
        await makeRequest(socket, "pushCoverage", [JSON.stringify(coverageData)]);
        // Ignoring this return because it's reached but after cov info has been
        // sent.
        /* istanbul ignore next */
        return f();
    })(page.killEditor);

    return createSocket();
});

