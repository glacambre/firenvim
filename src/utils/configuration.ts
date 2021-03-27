// These modes are defined in https://github.com/neovim/neovim/blob/master/src/nvim/cursor_shape.c
export type NvimMode = "all"
  | "normal"
  | "visual"
  | "insert"
  | "replace"
  | "cmdline_normal"
  | "cmdline_insert"
  | "cmdline_replace"
  | "operator"
  | "visual_select"
  | "cmdline_hover"
  | "statusline_hover"
  | "statusline_drag"
  | "vsep_hover"
  | "vsep_drag"
  | "more"
  | "more_lastline"
  | "showmatch";

export interface ISiteConfig {
    cmdline: "neovim" | "firenvim";
    content: "html" | "text";
    priority: number;
    renderer: "html" | "canvas";
    selector: string;
    takeover: "always" | "once" | "empty" | "nonempty" | "never";
}

export interface IConfig {
    globalSettings: {
        alt: "alphanum" | "all",
        "<C-n>": "default" | "noop",
        "<C-t>": "default" | "noop",
        "<C-w>": "default" | "noop",
        "<CS-n>": "default" | "noop",
        "<CS-t>": "default" | "noop",
        "<CS-w>": "default" | "noop",
        ignoreKeys: { [key in NvimMode]: string[] },
    };
    localSettings: { [key: string]: ISiteConfig };
}

let conf: IConfig = undefined as IConfig;

export const confReady = new Promise(resolve => {
    browser.storage.local.get().then((obj: any) => {
        conf = obj;
        resolve(true);
    });
});

browser.storage.onChanged.addListener((changes: any) => {
    Object
        .entries(changes)
        .forEach(([key, value]: [keyof IConfig, any]) => confReady.then(() => {
            conf[key] = value.newValue;
        }));
});

export function getGlobalConf() {
    // Can't be tested for
    /* istanbul ignore next */
    if (conf === undefined) {
        throw new Error("getGlobalConf called before config was ready");
    }
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
    // Can't be tested for
    /* istanbul ignore next */
    if (localSettings === undefined) {
        throw new Error("Error: your settings are undefined. Try reloading the page. If this error persists, try the troubleshooting guide: https://github.com/glacambre/firenvim/blob/master/TROUBLESHOOTING.md");
    }
    return Array.from(Object.entries(localSettings))
        .filter(([pat, _]) => (new RegExp(pat)).test(url))
        .sort((e1, e2) => (or1(e1[1].priority) - or1(e2[1].priority)))
        .reduce((acc, [_, cur]) => Object.assign(acc, cur), {} as ISiteConfig);
}
