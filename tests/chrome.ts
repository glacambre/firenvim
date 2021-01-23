import * as fs from "fs";
import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";

import {
 loadLocalPage,
 extensionDir,
 killDriver,
 reloadNeovim,
 testAce,
 testEvalJs,
 testCodemirror,
 testContentEditable,
 testDisappearing,
 testDynamicTextareas,
 testFocusGainedLost,
 testGithubAutofill,
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
 testUnfocusedKillEditor,
 testTakeoverEmpty,
 testTakeoverNonEmpty,
 testTakeoverOnce,
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

        beforeAll(async () => {
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
        }, 60000);

        beforeEach(async () => {
                resetVimrc();
                await loadLocalPage(server, driver, "simple.html", "")
                await reloadNeovim(server, driver);
                return loadLocalPage(server, driver, "simple.html", "")
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
                await killDriver(server, driver);
        }, 60000);

        test("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        nonHeadlessTest()("Firenvim modifiers work", () => testModifiers(server, driver));
        nonHeadlessTest()("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(server, driver), 60000);
        nonHeadlessTest()("Firenvim frame is resized on input resize", () => testInputResizes(server, driver));
        nonHeadlessTest()("Firenvim works on Ace", () => testAce(server, driver));
        nonHeadlessTest()("Firenvim works on CodeMirror", () => testCodemirror(server, driver));
        nonHeadlessTest()("Firenvim works on ContentEditable", () => testContentEditable(server, driver));
        nonHeadlessTest()("Firenvim works on Monaco", () => testMonaco(server, driver));
        nonHeadlessTest()("Firenvim works when span disappears", () => testDisappearing(server, driver));
        nonHeadlessTest()("Firenvim works on dynamically created elements", () => testDynamicTextareas(server, driver));
        nonHeadlessTest()("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(server, driver));
        nonHeadlessTest()("Firenvim works with large buffers", () => testLargeBuffers(server, driver));
        nonHeadlessTest()("FocusGained/lost autocmds are triggered", () => testFocusGainedLost(server, driver));
        nonHeadlessTest()("g:started_by_firenvim exists", () => testGStartedByFirenvim(server, driver));
        nonHeadlessTest()("Guifont works", () => testGuifont(server, driver));
        nonHeadlessTest()("Ignoring keys works", () => testIgnoreKeys(server, driver));
        nonHeadlessTest()("Input is focused after leaving frame", () => testInputFocusedAfterLeave(server, driver));
        nonHeadlessTest()("InputFocus works", () => testInputFocus(server, driver));
        nonHeadlessTest()("PageFocus works", () => testPageFocus(server, driver));
        nonHeadlessTest()("PressKeys works", () => testPressKeys(server, driver));
        nonHeadlessTest()("EvalJs works", () => testEvalJs(server, driver));
        nonHeadlessTest()("Resize works", () => testResize(server, driver));
        nonHeadlessTest()("Unfocused killEditor does not focus input", () => testUnfocusedKillEditor(server, driver));
        nonHeadlessTest()("Takeover: empty works", () => testTakeoverEmpty(server, driver));
        nonHeadlessTest()("Takeover: nonempty works", () => testTakeoverNonEmpty(server, driver));
        nonHeadlessTest()("Takeover: once works", () => testTakeoverOnce(server, driver));
        nonHeadlessTest()("Works in frame", () => testWorksInFrame(server, driver));
        nonHeadlessTest()("Github autofill works", () => testGithubAutofill(server, driver));
        if (process.platform === "linux") {
                nonHeadlessTest()("No lingering neovim process", () => testNoLingeringNeovims(server, driver));
        }
})
