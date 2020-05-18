require("chromedriver");

import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";

import {
 loadLocalPage,
 logFunc,
 extensionDir,
 killDriver,
 killPreloadedInstance,
 testAce,
 testEvalJs,
 testCodemirror,
 testDynamicTextareas,
 testFocusGainedLost,
 testGStartedByFirenvim,
 testGuifont,
 testInputFocus,
 testInputFocusedAfterLeave,
 testInputResizes,
 testLargeBuffers,
 testModifiers,
 testMonaco,
 testNestedDynamicTextareas,
 testNoLingeringNeovims,
 testPageFocus,
 testPressKeys,
 testResize,
 testTakeoverEmpty,
 testTakeoverNonEmpty,
 testTakeoverOnce,
 testVimrcFailure,
} from "./_common"
import { setupVimrc, resetVimrc } from "./_vimrc";

describe("Chrome", () => {

        let log : logFunc = () => {};
        let nonHeadlessTest = () => env["HEADLESS"] ? test.skip : test;
        let driver: any = undefined;
        beforeAll(async () => {
                try {
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

                        if (env["LOG"]) {
                                log = console.log;
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
                        await new Promise(r => setTimeout(r, 5000));
                        return await loadLocalPage(driver, "simple.html", "");
                } catch (e) {
                        console.log(e);
                }
        });

        beforeEach(async () => {
                try {
                        resetVimrc();
                        await new Promise(r => setTimeout(r, 5000));
                        await loadLocalPage(driver, "simple.html", "");
                        await new Promise(r => setTimeout(r, 5000));
                        return killPreloadedInstance(driver, log);
                } catch (e) {
                        console.log(e)
                }
        });

        afterAll(() => killDriver(driver));

        test("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        nonHeadlessTest()("Firenvim modifiers work", () => testModifiers(driver, log));
        nonHeadlessTest()("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(driver, log), 15000);
        nonHeadlessTest()("Firenvim frame is resized on input resize", () => testInputResizes(driver, log));
        nonHeadlessTest()("Firenvim works on Ace", () => testAce(driver, log));
        nonHeadlessTest()("Firenvim works on CodeMirror", () => testCodemirror(driver, log));
        nonHeadlessTest()("Firenvim works on Monaco", () => testMonaco(driver, log));
        nonHeadlessTest()("Firenvim works on dynamically created elements", () => testDynamicTextareas(driver, log));
        nonHeadlessTest()("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(driver, log));
        nonHeadlessTest()("Firenvim works with large buffers", () => testLargeBuffers(driver, log));
        nonHeadlessTest()("FocusGained/lost autocmds are triggered", () => testFocusGainedLost(driver, log));
        nonHeadlessTest()("g:started_by_firenvim exists", () => testGStartedByFirenvim(driver, log));
        nonHeadlessTest()("Guifont works", () => testGuifont(driver, log));
        nonHeadlessTest()("Input is focused after leaving frame", () => testInputFocusedAfterLeave(driver, log));
        nonHeadlessTest()("InputFocus works", () => testInputFocus(driver, log));
        nonHeadlessTest()("PageFocus works", () => testPageFocus(driver, log));
        nonHeadlessTest()("PressKeys works", () => testPressKeys(driver, log));
        nonHeadlessTest()("EvalJs works", () => testEvalJs(driver, log));
        nonHeadlessTest()("Resize works", () => testResize(driver, log));
        nonHeadlessTest()("Takeover: empty works", () => testTakeoverEmpty(driver, log));
        nonHeadlessTest()("Takeover: nonempty works", () => testTakeoverNonEmpty(driver, log));
        nonHeadlessTest()("Takeover: once works", () => testTakeoverOnce(driver, log));
        if (process.platform === "linux") {
                nonHeadlessTest()("No lingering neovim process", () => testNoLingeringNeovims(driver, log));
        }
})
