import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]

export interface ISiteConfig {
    selector: string;
    priority: number;
    takeover: "always" | "once" | "empty" | "nonempty" | "never";
    cmdline: "neovim" | "firenvim";
}

export interface IConfig {
    globalSettings: {
        alt: "alphanum" | "all",
        server: "persistent" | "ephemeral",
        server_url: string,
    };
    localSettings: { [key: string]: ISiteConfig };
}

let conf: IConfig = {} as IConfig;

export const confReady = new Promise(resolve => {
    browser.storage.local.get().then((obj: any) => {
        conf = obj;
        resolve(true);
    });
});

browser.storage.onChanged.addListener((changes: any) => {
    Object
        .entries(changes)
        .forEach(([key, value]: [keyof IConfig, any]) => conf[key] = value.newValue);
});

export function getGlobalConf() {
    return conf.globalSettings;
}

export function getConf() {
    return getConfForUrl(document.location.href);
}

export function getConfForUrl(url: string): ISiteConfig {
    const localSettings = conf.localSettings;
    function or1(val: number) {
        if (val === undefined) {
            return 1;
        }
        return val;
    }
    if (localSettings === undefined) {
        throw new Error("Error: your settings are undefined. Try reloading the page. If this error persists, try the troubleshooting guide: https://github.com/glacambre/firenvim/blob/master/TROUBLESHOOTING.md");
    }
    return Array.from(Object.entries(localSettings))
        .filter(([pat, sel]) => (new RegExp(pat)).test(url))
        .sort((e1, e2) => (or1(e1[1].priority) - or1(e2[1].priority)))
        .reduce((acc, [_, cur]) => Object.assign(acc, cur), {} as ISiteConfig);
}
