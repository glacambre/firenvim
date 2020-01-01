require("chromedriver");

const env = require("process").env;
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;

import {
 extensionDir,
 getNewestFileMatching,
 killDriver,
 testAce,
 testCodemirror,
 testDynamicTextareas,
 testGStartedByFirenvim,
 testGuifont,
 testInputFocus,
 testInputFocusedAfterLeave,
 testLargeBuffers,
 testModifiers,
 testMonaco,
 testNestedDynamicTextareas,
 testPageFocus,
 testPressKeys,
 testTakeoverEmpty,
 testTakeoverNonEmpty,
 testTakeoverOnce,
 testVimrcFailure,
} from "./_common"
import { setupVimrc } from "./_vimrc";

describe("Chrome", () => {

        let nonHeadlessTest = () => env["HEADLESS"] ? test.skip : test;
        let driver: any = undefined;
        beforeAll(() => {
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
        });

        afterAll(() => killDriver(driver));

        nonHeadlessTest()("Firenvim modifiers work", () => testModifiers(driver));
        nonHeadlessTest()("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(driver));
        nonHeadlessTest()("Firenvim works on Ace", () => testAce(driver));
        nonHeadlessTest()("Firenvim works on CodeMirror", () => testCodemirror(driver));
        nonHeadlessTest()("Firenvim works on Monaco", () => testMonaco(driver));
        nonHeadlessTest()("Firenvim works on dynamically created elements", () => testDynamicTextareas(driver));
        nonHeadlessTest()("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(driver));
        nonHeadlessTest()("Firenvim works with large buffers", () => testLargeBuffers(driver));
        nonHeadlessTest()("g:started_by_firenvim exists", () => testGStartedByFirenvim(driver));
        nonHeadlessTest()("Guifont works", () => testGuifont(driver));
        nonHeadlessTest()("Input is focused after leaving frame", () => testInputFocusedAfterLeave(driver));
        nonHeadlessTest()("InputFocus works", () => testInputFocus(driver));
        nonHeadlessTest()("PageFocus works", () => testPageFocus(driver));
        nonHeadlessTest()("PressKeys works", () => testPressKeys(driver));
        nonHeadlessTest()("Takeover: empty works", () => testTakeoverEmpty(driver));
        nonHeadlessTest()("Takeover: nonempty works", () => testTakeoverNonEmpty(driver));
        nonHeadlessTest()("Takeover: once works", () => testTakeoverOnce(driver));
        // Disabled because Chrome doesn't pass keyboard shortcuts to webextensions…
        // test("Manually calling firenvim works", () => testManualNvimify(driver));
})
