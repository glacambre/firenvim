declare class WebextensionEventTarget {
    public addListener(f: (a: any) => void): void;
    public removeListener(f: (a: any) => void): void;
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
    public disconnect(p: Port): void;
    public postMessage(msg: any): void;
}

declare namespace browser.runtime {
    function connect(): Port;
    function connectNative(name: string): Port;
    let onConnect: RuntimeOnConnect;
}

type NvimParameters = Array<[string, string]>;

interface INvimApiInfo {
    0: number;
    1: {
        error_types: {[key: string]: { id: number }},
        functions: Array<{
            deprecated_since?: number,
            method: boolean,
            name: string,
            parameters: NvimParameters,
            return_type: string,
            since: number,
        }>,
        types: {
            [key: string]: { id: number, prefix: string },
        },
        ui_events: Array<{
            name: string,
            parameters: NvimParameters,
            since: number,
        }>,
        ui_options: string[],
        version: {
            api_compatible: number,
            api_level: number,
            api_prerelease: boolean,
            major: number,
            minor: number,
            patch: number,
        },
    };
}

type HighlightUpdate = [number, { foreground: number, background: number }];
type ResizeUpdate = [number, number, number];
type GotoUpdate = [number, number, number];
type LineUpdate = [number, number, number, Array<[string, number, number?]>];

type HighlightArray = { foreground: string, background: string }[];

