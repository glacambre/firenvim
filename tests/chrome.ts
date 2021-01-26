import { exec } from "child_process";
import * as fs from "fs";
import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";

import {
 loadLocalPage,
 extensionDir,
 writeFailures,
 killDriver,
 reloadNeovim,
 testAce,
 testBrowserShortcuts,
 testCodemirror,
 testConfigPriorities,
 testContentEditable,
 testDisappearing,
 testDynamicTextareas,
 testEvalJs,
 testFocusGainedLost,
 testForceNvimify,
 testGithubAutofill,
 testGStartedByFirenvim,
 testGuifont,
 testHideEditor,
 testIgnoreKeys,
 testFocusInput,
 testInputFocusedAfterLeave,
 testInputResizes,
 testLargeBuffers,
 testModifiers,
 testMonaco,
 testNestedDynamicTextareas,
 testNoLingeringNeovims,
 testFocusPage,
 testPressKeys,
 testResize,
 testSetCursor,
 testUnfocusedKillEditor,
 testUpdates,
 testTakeoverEmpty,
 testTakeoverNonEmpty,
 testTakeoverOnce,
 testToggleFirenvim,
 testVimrcFailure,
 testWorksInFrame,
} from "./_common"
import { setupVimrc, resetVimrc } from "./_vimrc";
import * as coverageServer  from "./_coverageserver";

describe("Chrome", () => {

        let nonHeadlessTest = () => env["HEADLESS"] ? test.skip : test;
        let driver: any = undefined;
        let server: any = coverageServer;
        let background: any = undefined;
        let neovimVersion: number = 0;

        beforeAll(async () => {
                neovimVersion = await new Promise(resolve => {
                        exec("nvim --version", (_, stdout) => {
                                resolve(parseFloat(stdout.match(/nvim v[0-9]+\.[0-9]+\.[0-9]+/gi)[0].slice(6)));
                        });
                });

                const coverage_dir = path.join(process.cwd(), ".nyc_output");
                try {
                        fs.rmdirSync(coverage_dir, { recursive: true });
                } catch (e) {}
                fs.mkdirSync(coverage_dir, { recursive: true })

                await coverageServer.start(12345, coverage_dir);
                const backgroundPromise = coverageServer.getNextBackgroundConnection();

                setupVimrc();
                // Disabling the GPU is required on windows
                const options = (new (require("selenium-webdriver/chrome").Options)())
                        .addArguments("--disable-gpu")
                        .addArguments(`--load-extension=${path.join(extensionDir, "chrome")}`);

                // Won't work until this wontfix is fixed:
                // https://bugs.chromium.org/p/chromium/issues/detail?id=706008#c5
                if (env["HEADLESS"]) {
                        return;
                        // options.headless();
                }

                // Set user data path so that the native messenger manifest can
                // be found. This is not required on windows because they use a
                // registry key to find it
                const home = env["HOME"]
                switch (require("os").platform()) {
                        case "darwin":
                                options.addArguments(`--user-data-dir=${path.join(home, "Library", "Application Support", "Google", "Chrome")}`)
                                break;
                        case "win32":
                                break;
                        default:
                                options.addArguments(`--user-data-dir=${path.join(home, ".config", "google-chrome")}`)
                                break;
                }

                driver = new webdriver.Builder()
                        .forBrowser("chrome")
                        .setChromeOptions(options)
                        .build();

                background = await backgroundPromise;
                const pageLoaded = loadLocalPage(server, driver, "simple.html", "");
                return await pageLoaded;
        }, 120000);

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(server, driver, "simple.html", "")
                await reloadNeovim(server, driver);
                return loadLocalPage(server, driver, "simple.html", "")
        }, 120000);

        afterEach(async () => {
                // This should kill existing webdriver promises (e.g. wait
                // until element found) and prevent one test's errors from
                // contaminating another's.
                await loadLocalPage(server, driver, "simple.html", "");
        }, 120000);

        afterAll(async () => {
                await server.pullCoverageData(background);
                await server.shutdown();
                writeFailures();
                await killDriver(server, driver);
        }, 120000);

        function t(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test(s, () => f(s, server, driver), ms);
        }
        function o(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test.only(s, () => f(s, server, driver), ms);
        }

        t("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        t("Github autofill", testGithubAutofill);
        t("Force nvimify", testForceNvimify);
        t("Input focused after frame", testInputFocusedAfterLeave);
        t("FocusInput", testFocusInput);
        t("Dynamically created elements", testDynamicTextareas);
        t("Dynamically created nested elements", testNestedDynamicTextareas);
        t("Large buffers", testLargeBuffers);
        t("Modifiers work", testModifiers);
        t("Config priorities", testConfigPriorities);
        t("Add-on udpates", testUpdates);
        t("CodeMirror", testCodemirror);
        t("Contenteditable", testContentEditable);
        t("Input resize", testInputResizes);
        t("g:started_by_firenvim", testGStartedByFirenvim);
        t("Works in frames", testWorksInFrame);
        t("FocusPage", testFocusPage);
        t("Ace editor", testAce);
        t("Unfocused killEditor", testUnfocusedKillEditor);
        t("Textarea.setCursor", testSetCursor);
        t("Hide editor", testHideEditor);
        t("Monaco editor", testMonaco);
        t("Span removed", testDisappearing);
        t("Ignoring keys", testIgnoreKeys);
        t("Frame browser shortcuts", (...args) => neovimVersion >= 0.5
                ? testBrowserShortcuts(...args)
                : undefined
         , 30000);
        t("Takeover: nonempty", testTakeoverNonEmpty);
        t("Guifont", testGuifont);
        t("Takeover: once", testTakeoverOnce);
        t("PressKeys", testPressKeys);
        t("FocusGained/lost autocmds", testFocusGainedLost);
        t(":set columns lines", testResize);
        t("EvalJS", testEvalJs);
        t("Takeover: empty", testTakeoverEmpty);
        t("Toggling firenvim", testToggleFirenvim);
        t("Buggy Vimrc", testVimrcFailure, 60000);
        if (process.platform === "linux") {
                t("No lingering neovim process", testNoLingeringNeovims, 20000);
        }
})
