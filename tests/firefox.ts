import * as fs from "fs";
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
 testContentEditable,
 testDisappearing,
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
                await killDriver(server, driver);
        }, 60000);

        test("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        test("Firenvim modifiers work", () => testModifiers(server, driver));
        test("Firenvim frame disappears on buggy vimrc", () => testVimrcFailure(server, driver), 60000);
        test("Firenvim frame is resized on input resize", () => testInputResizes(server, driver));
        test("Firenvim works on Ace", () => testAce(server, driver));
        test("Firenvim works on CodeMirror", () => testCodemirror(server, driver));
        test("Firenvim works with ContentEditatble", () => testContentEditable(server, driver));
        test("Firenvim works on Monaco", () => testMonaco(server, driver));
        test("Firenvim works when span disappears", () => testDisappearing(server, driver));
        test("Firenvim works on dynamically created elements", () => testDynamicTextareas(server, driver));
        test("Firenvim works on dynamically created nested elements", () => testNestedDynamicTextareas(server, driver));
        test("Firenvim works with large buffers", () => testLargeBuffers(server, driver));
        test("FocusGained/lost autocmds are triggered", () => testFocusGainedLost(server, driver));
        test("g:started_by_firenvim exists", () => testGStartedByFirenvim(server, driver));
        test("Guifont works", () => testGuifont(server, driver));
        test("Ignoring keys works", () => testIgnoreKeys(server, driver));
        test("Input is focused after leaving frame", () => testInputFocusedAfterLeave(server, driver));
        test("InputFocus works", () => testInputFocus(server, driver));
        test("PageFocus works", () => testPageFocus(server, driver));
        test("EvalJS works", () => testEvalJs(server, driver));
        test("PressKeys works", () => testPressKeys(server, driver));
        test("Resize works", () => testResize(server, driver));
        test("Unfocused killEditor does not focus input", () => testUnfocusedKillEditor(server, driver));
        test("Takeover: empty works", () => testTakeoverEmpty(server, driver));
        test("Takeover: nonempty works", () => testTakeoverNonEmpty(server, driver));
        test("Takeover: once works", () => testTakeoverOnce(server, driver));
        test("Works in frames", () => testWorksInFrame(server, driver));
        if (process.platform === "linux") {
                test("No lingering neovim process", () => testNoLingeringNeovims(server, driver));
        }
})
