declare class WebextensionEventTarget {
    addListener(f: Function): void;
    removeListener(f: Function): void;
}

declare class RuntimeOnConnect extends WebextensionEventTarget{}

declare class PortError {
    message: string;
}

declare class PortOnDisconnect extends WebextensionEventTarget{}

declare class PortOnMessage extends WebextensionEventTarget{}

declare class Port {
    name: string;
    disconnect(): void;
    error: PortError;
    onDisconnect: PortOnDisconnect;
    onMessage: PortOnMessage;
    postMessage(msg: string): void;
}

declare namespace browser.runtime {
    function connect(): Port;
    function connectNative(name: string): Port;
    let onConnect: RuntimeOnConnect;
}
