require("geckodriver");

import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";
import { Options } from "selenium-webdriver/firefox";

import {
 loadLocalPage,
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
 testIgnoreKeys,
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
 testWorksInFrame,
} from "./_common"
import { setupVimrc, resetVimrc } from "./_vimrc";

describe("Firefox", () => {

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

                driver = new webdriver.Builder()
                        .forBrowser("firefox")
                        .setFirefoxOptions(options)
                        .build();

                return loadLocalPage(driver, "simple.html", "");
        });

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(driver, "simple.html", "");
                await reloadNeovim(driver);
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
        test("Firenvim modifiers work", () => testModifiers(driver));
        test("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(driver));
        test("Firenvim frame is resized on input resize", () => testInputResizes(driver));
        test("Firenvim works on Ace", () => testAce(driver));
        test("Firenvim works on CodeMirror", () => testCodemirror(driver));
        test("Firenvim works on Monaco", () => testMonaco(driver));
        test("Firenvim works on dynamically created elements", () => testDynamicTextareas(driver));
        test("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(driver));
        test("Firenvim works with large buffers", () => testLargeBuffers(driver));
        test("FocusGained/lost autocmds are triggered", () => testFocusGainedLost(driver));
        test("g:started_by_firenvim exists", () => testGStartedByFirenvim(driver));
        test("Guifont works", () => testGuifont(driver));
        test("Ignoring keys works", () => testIgnoreKeys(driver));
        test("Input is focused after leaving frame", () => testInputFocusedAfterLeave(driver));
        test("InputFocus works", () => testInputFocus(driver));
        test("PageFocus works", () => testPageFocus(driver));
        test("EvalJS works", () => testEvalJs(driver));
        test("PressKeys works", () => testPressKeys(driver));
        test("Resize works", () => testResize(driver));
        test("Takeover: empty works", () => testTakeoverEmpty(driver));
        test("Takeover: nonempty works", () => testTakeoverNonEmpty(driver));
        test("Takeover: once works", () => testTakeoverOnce(driver));
        test("Works in frames", () => testWorksInFrame(driver));
        if (process.platform === "linux") {
                test("No lingering neovim process", () => testNoLingeringNeovims(driver));
        }
})
