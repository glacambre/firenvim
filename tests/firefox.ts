require("geckodriver");

import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";
import { Options } from "selenium-webdriver/firefox";

import {
 loadLocalPage,
 logFunc,
 extensionDir,
 getNewestFileIn,
 killDriver,
 reloadNeovim,
 testAce,
 testCodemirror,
 testDynamicTextareas,
 testEvalJs,
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

describe("Firefox", () => {

        let log : logFunc = () => {};
        let driver: any = undefined

        beforeAll(async () => {
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

                if (env["LOG"]) {
                        log = console.log;
                }

                driver = new webdriver.Builder()
                        .forBrowser("firefox")
                        .setFirefoxOptions(options)
                        .build();

                return loadLocalPage(driver, "simple.html", "");
        });

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(driver, "simple.html", "");
                await reloadNeovim(driver, log);
                await loadLocalPage(driver, "simple.html", "")
        });

        afterEach(async () => {
                // This should kill existing webdriver promises (e.g. wait
                // until element found) and prevent one test's errors from
                // contaminating another's.
                await loadLocalPage(driver, "simple.html", "");
        });

        afterAll(() => killDriver(driver));

        test("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        test("Firenvim modifiers work", () => testModifiers(driver, log));
        test("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(driver, log));
        test("Firenvim frame is resized on input resize", () => testInputResizes(driver, log));
        test("Firenvim works on Ace", () => testAce(driver, log));
        test("Firenvim works on CodeMirror", () => testCodemirror(driver, log));
        test("Firenvim works on Monaco", () => testMonaco(driver, log));
        test("Firenvim works on dynamically created elements", () => testDynamicTextareas(driver, log));
        test("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(driver, log));
        test("Firenvim works with large buffers", () => testLargeBuffers(driver, log));
        test("FocusGained/lost autocmds are triggered", () => testFocusGainedLost(driver, log));
        test("g:started_by_firenvim exists", () => testGStartedByFirenvim(driver, log));
        test("Guifont works", () => testGuifont(driver, log));
        test("Input is focused after leaving frame", () => testInputFocusedAfterLeave(driver, log));
        test("InputFocus works", () => testInputFocus(driver, log));
        test("PageFocus works", () => testPageFocus(driver, log));
        test("EvalJS works", () => testEvalJs(driver, log));
        test("PressKeys works", () => testPressKeys(driver, log));
        test("Resize works", () => testResize(driver, log));
        test("Takeover: empty works", () => testTakeoverEmpty(driver, log));
        test("Takeover: nonempty works", () => testTakeoverNonEmpty(driver, log));
        test("Takeover: once works", () => testTakeoverOnce(driver, log));
        if (process.platform === "linux") {
                test("No lingering neovim process", () => testNoLingeringNeovims(driver, log));
        }
})
