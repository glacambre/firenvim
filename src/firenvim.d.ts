declare class WebextensionEventTarget {
    public addListener(f: () => void): void;
    public removeListener(f: () => void): void;
}

declare class RuntimeOnConnect extends WebextensionEventTarget {}

declare class PortError {
    public message: string;
}

declare class PortOnDisconnect extends WebextensionEventTarget {}

declare class PortOnMessage extends WebextensionEventTarget {}

declare class Port {
    public name: string;
    public onMessage: PortOnMessage;
    public onDisconnect: PortOnDisconnect;
    public error: PortError;
    public disconnect(): void;
    public postMessage(msg: string): void;
}

declare namespace browser.runtime {
    function connect(): Port;
    function connectNative(name: string): Port;
    let onConnect: RuntimeOnConnect;
}

interface WritableStream {
    write: (str: string) => void;
    pipe: () => void;
    cork: () => void;
    uncork: () => void;
    setDefaultEncoding: () => void;
    end: () => void;
}
