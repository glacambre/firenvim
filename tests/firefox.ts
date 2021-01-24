import * as fs from "fs";
import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";
import { Options } from "selenium-webdriver/firefox";

import {
 writeFailures,
 loadLocalPage,
 extensionDir,
 getNewestFileIn,
 killDriver,
 reloadNeovim,
 testAce,
 testCodemirror,
 testContentEditable,
 testDisappearing,
 testDynamicTextareas,
 testEvalJs,
 testFocusGainedLost,
 testGithubAutofill,
 testGStartedByFirenvim,
 testGuifont,
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
 testTakeoverEmpty,
 testTakeoverNonEmpty,
 testTakeoverOnce,
 testToggleFirenvim,
 testUnfocusedKillEditor,
 testVimrcFailure,
 testWorksInFrame,
} from "./_common"
import { setupVimrc, resetVimrc } from "./_vimrc";
import * as coverageServer  from "./_coverageserver";

describe("Firefox", () => {

        let driver: any = undefined;
        let server: any = coverageServer;
        let background: any = undefined;

        beforeAll(async () => {
                const coverage_dir = path.join(process.cwd(), ".nyc_output");
                try {
                        fs.rmdirSync(coverage_dir, { recursive: true });
                } catch (e) {}
                fs.mkdirSync(coverage_dir, { recursive: true })

                await coverageServer.start(12345, coverage_dir);
                const backgroundPromise = coverageServer.getNextBackgroundConnection();

                setupVimrc();
                const extensionPath = await getNewestFileIn(path.join(extensionDir, "xpi"));

                const options = (new Options())
                        .setPreference("xpinstall.signatures.required", false)
                        .addExtensions(extensionPath);

                if (env["HEADLESS"]) {
                        options.headless();
                }

                if (env["APPVEYOR"]) {
                        options.setBinary("C:\\Program Files\\Firefox Developer Edition\\firefox.exe");
                }

                driver = new webdriver.Builder()
                        .forBrowser("firefox")
                        .setFirefoxOptions(options)
                        .build();

                background = await backgroundPromise;
                const pageLoaded = loadLocalPage(server, driver, "simple.html", "");
                return await pageLoaded;
        }, 60000);

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(server, driver, "simple.html", "");
                await reloadNeovim(server, driver);
                await loadLocalPage(server, driver, "simple.html", "")
        }, 60000);

        afterEach(async () => {
                // This should kill existing webdriver promises (e.g. wait
                // until element found) and prevent one test's errors from
                // contaminating another's.
                await loadLocalPage(server, driver, "simple.html", "");
        }, 60000);

        afterAll(async () => {
                await server.pullCoverageData(background);
                await server.shutdown();
                writeFailures();
                await killDriver(server, driver);
        }, 60000);

        function t(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test(s, () => f(s, server, driver), ms);
        }
        function o(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test.only(s, () => f(s, server, driver), ms);
        }

        t("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        t("Modifiers work", testModifiers);
        t("Buggy Vimrc", testVimrcFailure, 60000);
        t("Input resize", testInputResizes);
        t("Ace editor", testAce);
        t("CodeMirror", testCodemirror);
        t("Contenteditable", testContentEditable);
        t("Monaco editor", testMonaco);
        t("Span removed", testDisappearing);
        t("Dynamically created elements", testDynamicTextareas);
        t("Dynamically created nested elements", testNestedDynamicTextareas);
        t("Large buffers", testLargeBuffers);
        t("FocusGained/lost autocmds", testFocusGainedLost);
        t("g:started_by_firenvim", testGStartedByFirenvim);
        t("Guifont", testGuifont);
        t("Ignoring keys", testIgnoreKeys);
        t("Input focused after frame", testInputFocusedAfterLeave);
        t("FocusInput", testFocusInput);
        t("FocusPage", testFocusPage);
        t("EvalJS", testEvalJs);
        t("PressKeys", testPressKeys);
        t(":set columns lines", testResize);
        t("Unfocused killEditor", testUnfocusedKillEditor);
        t("Takeover: empty", testTakeoverEmpty);
        t("Takeover: nonempty", testTakeoverNonEmpty);
        t("Takeover: once", testTakeoverOnce);
        t("Toggling firenvim", testToggleFirenvim);
        t("Works in frames", testWorksInFrame);
        t("Github autofill", testGithubAutofill);
        if (process.platform === "linux") {
                t("No lingering neovim process", testNoLingeringNeovims);
        }
})
