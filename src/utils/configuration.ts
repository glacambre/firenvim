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
    filename: string;
}

export type GlobalSettings = {
  alt: "alphanum" | "all",
  "<C-n>": "default" | "noop",
  "<C-t>": "default" | "noop",
  "<C-w>": "default" | "noop",
  "<CS-n>": "default" | "noop",
  "<CS-t>": "default" | "noop",
  "<CS-w>": "default" | "noop",
  ignoreKeys: { [key in NvimMode]: string[] },
  cmdlineTimeout: number,
}

export interface IConfig {
    globalSettings: GlobalSettings;
    localSettings: { [key: string]: ISiteConfig };
}

let conf: IConfig = undefined as IConfig;

export function mergeWithDefaults(os: string, settings: any): IConfig {
    function makeDefaults(obj: { [key: string]: any }, name: string, value: any) {
        if (obj[name] === undefined) {
            obj[name] = value;
        }
    }
    function makeDefaultLocalSetting(sett: { localSettings: { [key: string]: any } },
                                     site: string,
                                     obj: ISiteConfig) {
        makeDefaults(sett.localSettings, site, {});
        for (const key of (Object.keys(obj) as (keyof typeof obj)[])) {
            makeDefaults(sett.localSettings[site], key, obj[key]);
        }
    }
    if (settings === undefined) {
        settings = {};
    }

    makeDefaults(settings, "globalSettings", {});
    // "<KEY>": "default" | "noop"
    // #103: When using the browser's command API to allow sending `<C-w>` to
    // firenvim, whether the default action should be performed if no neovim
    // frame is focused.
    makeDefaults(settings.globalSettings, "<C-n>", "default");
    makeDefaults(settings.globalSettings, "<C-t>", "default");
    makeDefaults(settings.globalSettings, "<C-w>", "default");
    // Note: <CS-*> are currently disabled because of
    // https://github.com/neovim/neovim/issues/12037
    // Note: <CS-n> doesn't match the default behavior on firefox because this
    // would require the sessions API. Instead, Firefox's behavior matches
    // Chrome's.
    makeDefaults(settings.globalSettings, "<CS-n>", "default");
    // Note: <CS-t> is there for completeness sake's but can't be emulated in
    // Chrome and Firefox because this would require the sessions API.
    makeDefaults(settings.globalSettings, "<CS-t>", "default");
    makeDefaults(settings.globalSettings, "<CS-w>", "default");
    // #717: allow passing keys to the browser
    makeDefaults(settings.globalSettings, "ignoreKeys", {});
    // #1050: cursor sometimes covered by command line
    makeDefaults(settings.globalSettings, "cmdlineTimeout", 3000);

    // "alt": "all" | "alphanum"
    // #202: Only register alt key on alphanums to let swedish osx users type
    //       special chars
    // Only tested on OSX, where we don't pull coverage reports, so don't
    // instrument function.
    /* istanbul ignore next */
    if (os === "mac") {
        makeDefaults(settings.globalSettings, "alt", "alphanum");
    } else {
        makeDefaults(settings.globalSettings, "alt", "all");
    }

    makeDefaults(settings, "localSettings", {});
    makeDefaultLocalSetting(settings, ".*", {
        // "cmdline": "neovim" | "firenvim"
        // #168: Use an external commandline to preserve space
        cmdline: "firenvim",
        content: "text",
        priority: 0,
        renderer: "canvas",
        selector: 'textarea:not([readonly]), div[role="textbox"]',
        // "takeover": "always" | "once" | "empty" | "nonempty" | "never"
        // #265: On "once", don't automatically bring back after :q'ing it
        takeover: "always",
        filename: "{hostname%32}_{pathname%32}_{selector%32}_{timestamp%32}.{extension}",
    });
    makeDefaultLocalSetting(settings, "about:blank\\?compose", {
        cmdline: "firenvim",
        content: "text",
        priority: 1,
        renderer: "canvas",
        selector: 'body',
        takeover: "always",
        filename: "mail_{timestamp%32}.eml",
    });
    return settings;
}

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
