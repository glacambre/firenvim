require("geckodriver");

import * as process from "process";
const env = process.env;
import * as fs from "fs";
import * as path from "path";
import * as webdriver from "selenium-webdriver";
import { Options } from "selenium-webdriver/firefox";

import {
 loadLocalPage,
 logFunc,
 extensionDir,
 getNewestFileMatching,
 killDriver,
 reloadNeovim,
 optimizeFirenvimReady,
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
                const extensionPath = await getNewestFileMatching(path.join(extensionDir, "xpi"), ".*.zip");

                // Temporary workaround until
                // https://github.com/SeleniumHQ/selenium/pull/7464 is merged
                let xpiPath: string
                if (extensionPath !== undefined) {
                        xpiPath = extensionPath.replace(/\.zip$/, ".xpi");
                        fs.renameSync(extensionPath, xpiPath);
                } else {
                        xpiPath = await getNewestFileMatching(path.join(extensionDir, "xpi"), ".*.xpi");
                }

                const options = (new Options())
                        .setPreference("xpinstall.signatures.required", false)
                        .addExtensions(xpiPath);

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

                optimizeFirenvimReady();
                return loadLocalPage(driver, "simple.html", "");
        });

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(driver, "simple.html", "");
                await reloadNeovim(driver, log);
                await loadLocalPage(driver, "simple.html", "")
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
