
import * as process from "process";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as webdriver from "selenium-webdriver";
const Until = webdriver.until;
const By = webdriver.By;

import * as coverageServer from "./_coverageserver";
type Server = typeof coverageServer;

import { readVimrc, resetVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(20000);
const FIRENVIM_INIT_DELAY = 1000;
const WAIT_DELAY = 3000;

export const pagesDir = path.resolve(path.join("tests", "pages"));
export const extensionDir = path.resolve("target");

// Returns the path of the newest file in directory
export async function getNewestFileIn(directory: string) {
        // Get list of files
        const names = ((await new Promise((resolve, reject) => {
                fs.readdir(directory, (err: Error, filenames: string[]) => {
                        if (err) {
                                return reject(err);
                        }
                        return resolve(filenames);
                })
                // Keep only files matching pattern
        })) as string[]);
        // Get their stat struct
        const stats = await Promise.all(names.map(name => new Promise((resolve, reject) => {
                const fpath = path.join(directory, name)
                fs.stat(fpath, (err: any, stats) => {
                        if (err) {
                                reject(err);
                        }
                        (stats as any).path = fpath;
                        return resolve(stats);
                })
        })));
        // Sort by most recent and keep first
        return ((stats.sort((stat1: any, stat2: any) => stat2.mtime - stat1.mtime)[0] || {}) as any).path;
}

function sendKeys(driver: webdriver.WebDriver, keys: any[]) {
        return keys.reduce((prom, key) => prom
                .then((action: any) => action.pause(5).sendKeys(key))
                , Promise.resolve(driver.actions()))
            .then((action: any) => action.perform());
}

export async function loadLocalPage(server: Server, driver: webdriver.WebDriver, page: string, title = "") {
        let error: Error;
        for (let i = 0; i < 3; ++i) {
                try {
                        const conn = server.getNextContentConnection();
                        await driver.get("file://" + path.join(pagesDir, page));
                        const socket = await conn;
                        await driver.executeScript(`document.documentElement.focus();document.title=${JSON.stringify(title)}`);
                        return socket;
                        
                } catch (e) {
                        error = e;
                }
        }
        throw error;
}

export async function createFirenvimFor (server: Server, driver: webdriver.WebDriver, element: any) {
        const frameSocketProm = server.getNextFrameConnection();
        const input = await driver.wait(Until.elementLocated(element), WAIT_DELAY, "element not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const firenvimElemProm = driver.wait(Until.elementLocated(By.css("body > span:last-of-type")), WAIT_DELAY, "Firenvim span not found");
        return [input, ...(await Promise.all([firenvimElemProm, frameSocketProm]))] as [webdriver.WebElement, webdriver.WebElement, any];
}

type testFunction = (s: string, server: any, driver: webdriver.WebDriver) => Promise<void>;

function withLocalPage(page: string, f: testFunction): testFunction {
        return async function (title, server, driver) {
                await server.backgroundEval(`Promise.all(
                        browser.windows.getAll()
                                .then(a => a.slice(1).map(w => browser.windows.remove(w.id)))
                )`);
                const contentSocket = await loadLocalPage(server, driver, page, title);
                try {
                        return await f(title, server, driver);
                } catch (e) {
                        throw e;
                } finally {
                        await server.pullCoverageData(contentSocket);
                }
        }
}

let failureLog = "";
function retryTest(f: testFunction): testFunction {
        return async (s: string, server: any, driver: webdriver.WebDriver) => {
                let result: void;
                let error: Error;
                let failures = 0;
                let attempts = 0;
                for (attempts = 0; attempts == failures && attempts < 3; ++attempts) {
                        resetVimrc();
                        try {
                                result = await f(s, server, driver);
                        } catch (e) {
                                failures += 1;
                                failureLog += `\n\n===== ${s} attempt ${failures} =====\n`
                                failureLog += e.stack.toString();
                                failureLog += e.toString();
                                failureLog += `\n== VimrcAfter ==:\n${readVimrc()}\n`;
                                error = e;
                        }
                }
                if (attempts == failures) {
                        throw error;
                }
                return result;
        }
}
export function writeFailures() {
        fs.writeFileSync(path.join(process.cwd(), "failures.txt"), failureLog);
};

export const testModifiers = retryTest(withLocalPage("simple.html", async (_: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await driver.actions()
                .keyDown("a")
                .keyUp("a")
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyDown("i")
                .keyUp("i")
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.ALT)
                .keyDown("i")
                .keyUp("i")
                .keyUp(webdriver.Key.ALT)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.COMMAND)
                .keyDown("i")
                .keyUp("i")
                .keyUp(webdriver.Key.COMMAND)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyUp(webdriver.Key.COMMAND)
                .keyDown(webdriver.Key.SHIFT)
                .keyDown(webdriver.Key.ARROW_LEFT)
                .keyUp(webdriver.Key.ARROW_LEFT)
                .keyUp(webdriver.Key.SHIFT)
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.SHIFT)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.ENTER)
                .keyDown(webdriver.Key.ENTER)
                .keyUp(webdriver.Key.CONTROL)
                .keyUp(webdriver.Key.SHIFT)
                .perform();
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("	<M-i><D-i><S-Left><C-S-CR>\n");
}));

export const testUnfocusedKillEditor = retryTest(withLocalPage("simple.html", async (_: string, server: any, driver: webdriver.WebDriver) => {
        const [, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":w | call firenvim#focus_page() | q".split("")
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        expect(["HTML", "BODY"])
               .toContain(await driver.executeScript("return document.activeElement.tagName;"));
}));

export const testGStartedByFirenvim = retryTest(withLocalPage("simple.html", async (_: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ["a"])
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=g:started_by_firenvim".split("")
                       .concat([webdriver.Key.ENTER])
                       .concat([webdriver.Key.ESCAPE])
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch("true");
}));

export const testCodemirror = retryTest(withLocalPage("codemirror.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.css("div.CodeMirror"));
        const originalValue = (await input.getAttribute("innerText"));
        // Somehow there's a focus issue with this test. We actively attempt to
        // refocus the span if it isn't focused.
        for (let i = 0; i < 3; ++i) {
                if (webdriver.WebElement.equals(span, await driver.executeScript("return document.activeElement"))) {
                        break;
                } else {
                        await driver.executeScript("arguments[0].focus()", input);
                        await driver.sleep(100);
                }
        }
        await sendKeys(driver, "ggITest".split(""));
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=&ft".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Span handle did not go stale.");
        await driver.wait(async () => (await input.getAttribute("innerText")) != originalValue, WAIT_DELAY, "CodeMirror element's content did not change.");
        expect(await input.getAttribute("innerText")).toMatch(/Testhtml<!--/);
}));

export const testAce = retryTest(withLocalPage("ace.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.css("#editor"));
        const initialValue = await input.getAttribute("innerText");
        await sendKeys(driver, "ggITest".split(""));
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=&ft".split("")
                .concat(webdriver.Key.ENTER)
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span handle did not go stale");
        await driver.wait(async () => (await input.getAttribute("innerText")) != initialValue, WAIT_DELAY, "input value did not change");
        expect(await input.getAttribute("innerText")).toMatch(/Testjavascriptalert()/);
}));

export const testMonaco = retryTest(withLocalPage("monaco.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.css("#container"));
        const originalValue = await input.getAttribute("innerText");
        await sendKeys(driver, "ggITest".split(""));
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=&ft".split("")
                .concat(webdriver.Key.ENTER)
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("innerText")) != originalValue, WAIT_DELAY, "Value did not change");
        expect(await input.getAttribute("innerText")).toMatch(/^1\n2\n3\nTesttypescriptfunction/);
}));

export const testDynamicTextareas = retryTest(withLocalPage("dynamic.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const frameSocketPromise = server.getNextFrameConnection();
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")), WAIT_DELAY, "insert-textarea not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        await driver.actions().click(btn).perform();
        await frameSocketPromise;
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), WAIT_DELAY, "Firenvim span not found");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > textarea")), WAIT_DELAY, "body > textarea not found");
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""), WAIT_DELAY, "Input alue did not change");
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}));

export const testNestedDynamicTextareas = retryTest(withLocalPage("dynamic_nested.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const frameSocketPromise = server.getNextFrameConnection();
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")), WAIT_DELAY, "insert-textarea not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        await driver.actions().click(btn).perform();
        await frameSocketPromise;
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), WAIT_DELAY, "Firenvim span not found");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > div:nth-child(3) > textarea:nth-child(1)")), WAIT_DELAY, "body > div:nth-child(3) > textarea:nth-child(1) not found");
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}));

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export function reloadNeovim(server: any, driver: webdriver.WebDriver) {
        return server.updateSettings();
}

export const testVimrcFailure = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        // Check case where the vimrc doesn't load the neovim plugin
        await writeVimrc("");
        await reloadNeovim(server, driver);
        await driver.sleep(10000);

        const input = await driver.wait(Until.elementLocated(By.id("content-input")), WAIT_DELAY, "content-input");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        let shouldCheck: boolean;
        let span;
        try {
                span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")),
                                         1000,
                                         "Element not found");
                shouldCheck = true;
        } catch (e) {
                // We weren't fast enough to catch the frame appear/disappear,
                // that's ok
                shouldCheck = false; 
        }
        if (shouldCheck) {
                // The firenvim frame should disappear after a second
                await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        }
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);

        // Check case where the vimrc is broken and makes neovim emit an error
        // message
        await writeVimrc("call");
        await reloadNeovim(server, driver);
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        try {
                span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")),
                                         1000,
                                         "Element not found");
                shouldCheck = true;
        } catch (e) {
                // We weren't fast enough to catch the frame appear/disappear,
                // that's ok
                shouldCheck = false; 
        }
        if (shouldCheck) {
                // The firenvim frame should disappear after a second
                await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        }
}));

export const testGuifont = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        await reloadNeovim(server, driver);
        let [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "100aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat("^gjib".split(""))
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        const initVal = await input.getAttribute("value");
        expect(initVal).toMatch(/a+ba+/);
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.sleep(500);
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await writeVimrc(backup);
        await reloadNeovim(server, driver);
        [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "^gjib".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== initVal), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
}));

export const testForceNvimify = retryTest(withLocalPage("input.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), WAIT_DELAY, "Input field not found");
        const originalValue = await input.getAttribute("value");
        const frameSocketProm = server.getNextFrameConnection();
        await server.forceNvimify();
        const span = await driver.wait(Until.elementLocated(By.css("body > span:last-of-type")), WAIT_DELAY, "Firenvim span not found");
        await frameSocketProm;
        await sendKeys(driver, "A world".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value") !== originalValue), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe(originalValue + " world");
}));

export const testFocusPage = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Page focus did not change");
        await server.pullCoverageData(frameSocket);
}));

export const testFocusInput = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Page focus did not change");
        await server.pullCoverageData(frameSocket);
}));

export const testEvalJs = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
au TextChanged * ++nested write
function! OnResult(result) abort
        call nvim_buf_set_lines(0, 0, -1, 0, [a:result])
endfunction
${backup}`);
        await reloadNeovim(server, driver);
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, `:call firenvim#eval_js('(document`.split(""));
        // Using the <C-v> trick here because Chrome somehow replaces `.` with
        // `<`. This might have to do with locale stuff?
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, `046getElementById("content-input")`.split(""));
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, `046value = "Eval Works!")')`.split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value")) !== "", WAIT_DELAY, "Input value did not change");
        const value = await input.getAttribute("value");
        expect(value).toBe("Eval Works!");
        await sendKeys(driver, `:call firenvim#eval_js("(()=>{throw new Error()})()", "OnResult")`.split("").concat([webdriver.Key.ENTER]))
        await driver.wait(async () => (await input.getAttribute("value")) !== value, WAIT_DELAY, "Input value did not change the second time");
        expect(await input.getAttribute("value")).toBe("{}");
        await server.pullCoverageData(frameSocket);
}));

export const testPressKeys = retryTest(withLocalPage("chat.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        let value = await input.getAttribute("value");
        await sendKeys(driver, ":call firenvim#press_keys('<C-CR>')".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ((await input.getAttribute("value")) !== value), WAIT_DELAY, "Input value did not change");
        value = await input.getAttribute("value");
        await sendKeys(driver, ":call firenvim#press_keys('<C-A>')".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ((await input.getAttribute("value")) !== value), WAIT_DELAY, "Input value did not change");
        value = await input.getAttribute("value");
        await sendKeys(driver, ":call firenvim#press_keys('b')".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ((await input.getAttribute("value")) !== value), WAIT_DELAY, "Input value did not change");
        value = await input.getAttribute("value");
        await sendKeys(driver, ":call firenvim#press_keys('<Space>')".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ((await input.getAttribute("value")) !== value), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("<C-Enter> pressed!<C-A> pressed!b pressed!Space pressed!")
        await server.pullCoverageData(frameSocket);
}));

export const testInputFocusedAfterLeave = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Input element not focused after leaving frame");
}));;

export const testFocusGainedLost = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":autocmd FocusLost ".split("")));
        await driver.actions()
                .keyDown(webdriver.Key.MULTIPLY)
                .keyUp(webdriver.Key.MULTIPLY)
                .perform();
        await sendKeys(driver, " ++nested write".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(":autocmd FocusGained ".split("")));
        await driver.actions()
                .keyDown(webdriver.Key.MULTIPLY)
                .keyUp(webdriver.Key.MULTIPLY)
                .perform();
        await sendKeys(driver, " normal ab".split("")
                       .concat(webdriver.Key.ENTER));
        await driver.sleep(100);
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);
        expect(["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")))
                .toBe(true);
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("a");
        await driver.actions().click(input).perform();
        await sendKeys(driver, ":wq!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value") !== "a"), WAIT_DELAY, "Input value did not change the second time");
        expect(await input.getAttribute("value")).toBe("ab");
}));

export const testTakeoverOnce = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        await reloadNeovim(server, driver);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        const body = await driver.wait(Until.elementLocated(By.id("body")), WAIT_DELAY, "body not found");
        await driver.actions().click(body).perform();
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame automatically created while disabled by config.");
                        }
                });
}));

export const testTakeoverEmpty = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'empty' } } }
${backup}
                `);
        await reloadNeovim(server, driver);
        let [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        // Makign sure that whitespace == empty
        await sendKeys(driver, "i".split("")
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) !== "", WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("\n\n\n");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        // Making sure that content != empty
        await sendKeys(driver, "gg^dGii".split("")
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) !== "\n\n\n", WAIT_DELAY, "Input value did not change the second time");
        expect(await input.getAttribute("value")).toBe("i");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
}));

export const testTakeoverNonEmpty = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'nonempty' } } }
${backup}
                `);
        await reloadNeovim(server, driver);
        let input = await driver.wait(Until.elementLocated(By.id("content-input")), WAIT_DELAY, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
        await driver.executeScript(`arguments[0].value = 'i';
                                    arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        const [_, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
}));

export const testLargeBuffers = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const i = await driver.wait(Until.elementLocated(By.id("content-input")), WAIT_DELAY, "content-input");
        await driver.executeScript(`arguments[0].scrollIntoView(true);
                                   arguments[0].value = (new Array(5000)).fill("a").join("");`, i);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "Aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) == (new Array(5001)).fill("a").join(""), WAIT_DELAY, "Input value did not change");
}));

export const testNoLingeringNeovims = retryTest(async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        // Load neovim once and kill the tab, then load neovim again and kill
        // the frame.
        let contentSocket = await loadLocalPage(server, driver, "simple.html", testTitle);
        let [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await server.pullCoverageData(contentSocket);
        contentSocket = await loadLocalPage(server, driver, "simple.html", testTitle);
        [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");

        await driver.sleep(3000);

        // All npm packages that promise to return the child process tree do so
        // by parsing the output of `ps` or of its windows equivalent. I find
        // completely insane that there's no better way to do this and since
        // there isn't, there's no point in depending on these packages.
        const pstree = spawn("pstree", [process.pid.toString()]);
        const data: string = await (new Promise(resolve => {
                let data = "";
                pstree.stdout.on("data", (d: any) => data += d);
                pstree.on("close", () => resolve(data));
        }));
        const match = data.match(/-(\d+\*)?[{\[]?nvim[\]}]?/)
        expect(match[1]).toBe(undefined);
        await server.pullCoverageData(contentSocket);
});

export const testInputResizes = retryTest(withLocalPage("resize.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "100aa".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat("^gjib".split(""))
                       .concat(webdriver.Key.ESCAPE));
        const button = await driver.wait(Until.elementLocated(By.id("button")), WAIT_DELAY, "button not found");
        await driver.actions().click(button).perform();
        await driver.actions().click(input).perform();
        await sendKeys(driver, "^gjib".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
}));

export const testResize = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":set lines=100".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(":set columns=300".split(""))
                       .concat(webdriver.Key.ENTER)
                       .concat("a"));
        // Give the frame time to resize itself
        await driver.sleep(1000);
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=&lines".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(webdriver.Key.ENTER));
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, "=&columns".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        const [lines, columns] = (await input.getAttribute("value"))
                .split("\n")
                .map((v: string) => parseInt(v));
        expect(lines).toBeLessThan(100);
        expect(columns).toBeLessThan(300);
}));

export const testWorksInFrame = retryTest(withLocalPage("parentframe.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const frame = await driver.wait(Until.elementLocated(By.id("frame")));
        driver.switchTo().frame(frame);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "aa".split("")
                .concat([webdriver.Key.ESCAPE])
                .concat(":wq".split(""))
                .concat([webdriver.Key.ENTER])
        );
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("a");
}));

export const testIgnoreKeys = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
nnoremap <C-1> i<LT>C-1><Esc>
nnoremap <C-2> i<LT>C-2><Esc>
inoremap <C-1> <LT>C-1>
inoremap <C-2> <LT>C-2>
inoremap <C-3> <LT>C-3>
inoremap <C-4> <LT>C-4>
inoremap <C-5> <LT>C-5>
nnoremap <C-5> i<LT>C-5><Esc>
let g:firenvim_config = {
        \\ 'globalSettings': {
                \\ 'ignoreKeys': {
                        \\ 'normal': ['<C-1>'],
                        \\ 'insert': ['<C-2>', '<C-3>'],
                        \\ 'all': ['<C-5>'],
                \\ }
        \\ }
\\ }
${vimrcContent}
                `);
        await reloadNeovim(server, driver);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await driver.actions()
                // normal <C-1>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("1")
                .keyUp("1")
                .keyUp(webdriver.Key.CONTROL)
                // normal <C-2>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("2")
                .keyUp("2")
                .keyUp(webdriver.Key.CONTROL)
                // normal <C-5>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("5")
                .keyUp("5")
                .keyUp(webdriver.Key.CONTROL)
                // enter insert mode
                .keyDown("a")
                .keyUp("a")
                .pause(1000)
                // insert <C-1>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("1")
                .keyUp("1")
                .keyUp(webdriver.Key.CONTROL)
                // insert <C-2>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("2")
                .keyUp("2")
                .keyUp(webdriver.Key.CONTROL)
                // insert <C-3>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("3")
                .keyUp("3")
                .keyUp(webdriver.Key.CONTROL)
                // insert <C-4>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("4")
                .keyUp("4")
                .keyUp(webdriver.Key.CONTROL)
                // insert <C-5>
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("5")
                .keyUp("5")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        const result = "<C-2><C-1><C-4>"
        // The reason for the exclamation mark is that chromedriver sucks for
        // working with non us-qwerty keyboard layouts.
        expect([result, "!"])
               .toContain((await input.getAttribute("value")).slice(0, result.length));
}));

export const testContentEditable = retryTest(async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = {
        \\ 'localSettings': {
                \\ '.*': {
                        \\ 'selector': '*[contenteditable=true]',
                        \\ 'content': 'html',
                \\ }
        \\ }
\\ }
${vimrcContent}`);
        await reloadNeovim(server, driver);
        // Need to load the page manually here as propagating the selector
        // modifications do not result in creating new event listeners.
        const contentSocket = await loadLocalPage(server, driver, "contenteditable.html", testTitle);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        const innerText = await input.getAttribute("innerText");
        const innerHTML = await input.getAttribute("innerHTML");
        await sendKeys(driver, ":%s/b>/i>/g".split("")
                       .concat(webdriver.Key.ENTER)
                       .concat(":wq".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("innerHTML") !== innerHTML), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("innerText")).toBe(innerText);
        expect((await input.getAttribute("innerHTML")).trim()).toBe("<i>Firenvim</i> <i>works</i>!");
        await server.pullCoverageData(contentSocket);
});

export const testConfigPriorities = retryTest(async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = {
        \\ 'localSettings': {
                \\ '.*': {
                        \\ 'selector': '*[contenteditable=true]',
                        \\ 'content': 'html',
                \\ },
                \\ '.*.html': {
                        \\ 'content': 'html',
                \\ },
                \\ 'contenteditable.html': {
                        \\ 'content': 'text',
                        \\ 'priority': 10,
                \\ }
        \\ }
\\ }
${vimrcContent}`);
        await reloadNeovim(server, driver);
        // see contenteditable test to know why manual loading is required
        const contentSocket = await loadLocalPage(server, driver, "contenteditable.html", testTitle);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        const innerText = await input.getAttribute("innerText");
        const innerHTML = await input.getAttribute("innerHTML");
        await sendKeys(driver, ":wq".split("").concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("innerHTML") !== innerHTML), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("innerText")).toBe(innerText);
        expect((await input.getAttribute("innerHTML")).trim()).toBe(innerText);
        await server.pullCoverageData(contentSocket);
});


export const testDisappearing = retryTest(withLocalPage("disappearing.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        let [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        // simulate the page making the span disappear again
        await driver.executeScript("document.querySelector('span').remove()");
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        // somehow ready is too fast here, so we need an additional delay
        // commented when switched to coverage server. uncomment if issues.
        // await driver.sleep(FIRENVIM_INIT_DELAY);
        await sendKeys(driver, "iworks".split("")
                       .concat([webdriver.Key.ESCAPE])
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear the second time");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect("works").toBe(await input.getAttribute("value"));
}));

export const testGithubAutofill = retryTest(async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        // Prepare page, which has to contain issue template
        const template_content = fs.readFileSync(path.join(process.cwd(), ".github/ISSUE_TEMPLATE.md")).toString();
        const simple_content = fs.readFileSync(path.join(pagesDir, "simple.html")).toString();
        const github_content = simple_content.replace(
                /<textarea[^>]+><\/textarea>/,
                `<textarea id="issue_body" cols="80" rows="20">${template_content}</textarea>`
        );
        fs.writeFileSync(path.join(pagesDir, "github.html"), github_content);

        // compute the information we expect to see
        const version = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json")).toString()).version;

        // Now load page and check that browser info was filled
        const contentSocket = await loadLocalPage(server, driver, "github.html", testTitle);
        const issue_body = await driver.wait(Until.elementLocated(By.id("issue_body")));
        await driver.wait(async () => (await issue_body.getAttribute("value") !== github_content), WAIT_DELAY, "Issue body not filled!");
        const issue_content = await issue_body.getAttribute("value");
        expect(issue_content).toMatch(new RegExp(`OS Version: (linux|mac|win)`, 'g'));
        expect(issue_content).toMatch(new RegExp(`Browser Version:.*(Chrom|Firefox)`, 'g'));
        expect(issue_content).toMatch(new RegExp(`Browser Addon Version: ${version}`, 'g'));
        expect(issue_content).toMatch(new RegExp(`Neovim Plugin Version: ${version}`, 'g'));
        await server.pullCoverageData(contentSocket);
});

export const testToggleFirenvim = retryTest(async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        // Loading page and toggling correctly disables firenvim in tab
        let contentSocket = await loadLocalPage(server, driver, "simple.html", testTitle);
        await server.toggleFirenvim();
        let input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while Firenvim should have been disabled!");
                        }
                });
        await server.pullCoverageData(contentSocket);

        // Firenvim stays disabled when loading a new page in a disabled tab
        contentSocket = await loadLocalPage(server, driver, "simple.html", testTitle);
        input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while Firenvim should have been disabled!");
                        }
                });

        // Re-enabling firenvim when it was loaded in a disabled tab works
        await server.toggleFirenvim();
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.sleep(FIRENVIM_INIT_DELAY);
        const [, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        await server.pullCoverageData(contentSocket);
});

export const testFrameBrowserShortcuts = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ["i"]);
        async function ctrlV() {
                await driver.sleep(20);
                await driver.actions()
                        .keyDown(webdriver.Key.CONTROL)
                        .keyDown("v")
                        .keyUp("v")
                        .keyUp(webdriver.Key.CONTROL)
                        .perform();
                return driver.sleep(20);
        }
        await ctrlV();
        await server.browserShortcut("<C-n>");
        await ctrlV();
        await server.browserShortcut("<C-t>");
        await ctrlV();
        await server.browserShortcut("<C-w>");
        await driver.sleep(50);
        // Turn special chars into ascii representation that we will be able to
        // retrieve from textarea
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                      .concat('^:redir @"'.split(""))
                      .concat(webdriver.Key.ENTER)
                      .concat(":ascii".split(""))
                      .concat(webdriver.Key.ENTER)
                      .concat("l:ascii".split(""))
                      .concat(webdriver.Key.ENTER)
                      .concat("l:ascii".split(""))
                      .concat(webdriver.Key.ENTER)
                      .concat(":redir END".split(""))
                      .concat(webdriver.Key.ENTER)
                      .concat("VpGo".split("")));
        await driver.sleep(50);
        await ctrlV();
        await server.browserShortcut("<CS-n>");
        await ctrlV();
        await server.browserShortcut("<CS-t>");
        await ctrlV();
        await server.browserShortcut("<CS-w>");
        await driver.sleep(50);
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                                .concat(":wq!".split(""))
                                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("\n"
                                                       + "\n<^N>  14,  Hex 0e,  Oct 016, Digr SO\n"
                                                       + "\n<^T>  20,  Hex 14,  Oct 024, Digr D4\n"
                                                       + "\n<^W>  23,  Hex 17,  Oct 027, Digr EB\n"
                                                       + "<C-S-N><C-S-T><C-S-W>");
}));

export const testUpdates = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await server.tryUpdate();
        await sendKeys(driver, "iUpdates working!".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!")
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("Updates working!");
}));

export const testHideEditor = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":call firenvim#hide_frame()".split("").concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await driver.switchTo().activeElement().getAttribute("id") === "content-input"), WAIT_DELAY, "Focus didn't switch back to input");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.actions().click(input).perform();
        await driver.wait(async () => (await driver.switchTo().activeElement() !== input), WAIT_DELAY, "Focus didn't switch back to span");
        await sendKeys(driver, ":wq!".split("").concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
}));

export const testSetCursor = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].value = "a$a€a𐐷a💩a\\na💩a𐐷a€a$a"`, input);
        const [,span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                                .concat(":norm gg^G$h".split(""))
                                .concat(webdriver.Key.ENTER)
                                .concat(":wq!")
                                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        // Give a bit more time for the cursor to move. Avoids race conditions.
        await driver.sleep(1000);
        const cursor = await driver.executeScript("return document.activeElement.selectionStart");
        expect(cursor).toBe(21);
}));

export const testBrowserShortcuts = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        function getWindowCount () {
                return server.backgroundEval("browser.windows.getAll({}).then(a => a.length)")
        }
        function getTabCount () {
                return server.backgroundEval("browser.tabs.query({}).then(a => a.length)")
        }
        function windowCountChange (windowCount: number, err: string) {
                return driver.wait(async () => (await getWindowCount() !== windowCount), WAIT_DELAY, err);
        }
        function tabCountChange (tabCount: number, err: string) {
                return driver.wait(async () => (await getTabCount() !== tabCount), WAIT_DELAY, err);
        }

        const originalHandle = (await driver.getAllWindowHandles())[0];

        // <C-n> creates a new window
        let windowCount = await getWindowCount();
        await server.browserShortcut("<C-n>");
        await windowCountChange(windowCount, "<C-n> did not change the number of windows");
        let newWindowCount = await getWindowCount();
        expect(newWindowCount).toBe(windowCount + 1);

        // Get handle to new window and switch to it
        let handles = new Set(await driver.getAllWindowHandles());
        handles.delete(originalHandle);
        const newWindow = handles.values().next().value;
        await driver.switchTo().window(newWindow);

        // <C-t> crates a new tab
        let tabCount = await getTabCount();
        await server.browserShortcut("<C-t>");
        await tabCountChange(tabCount, "<C-t> did not change the number of tabs");
        let newTabCount = await getTabCount();
        expect(newTabCount).toBe(tabCount + 1);

        // Get handle to new tab and switch to it
        handles = new Set(await driver.getAllWindowHandles());
        handles.delete(originalHandle);
        handles.delete(newWindow);
        const newTab = handles.values().next().value;
        await driver.switchTo().window(newTab);

        // <C-w> closes the new tab
        tabCount = await getTabCount();
        await server.browserShortcut("<C-w>");
        await tabCountChange(tabCount, "<C-w> did not change the number of tabs");
        newTabCount = await getTabCount();
        expect(newTabCount).toBe(tabCount - 1);

        // <CS-n> creates a new incognito window. This is chrome behavior but
        // we can't emulate firefox because it requires an additonal permission
        windowCount = await getWindowCount();
        await server.browserShortcut("<CS-n>");
        await windowCountChange(windowCount, "<CS-n> did not change the number of windows");
        newWindowCount = await getWindowCount();
        expect(newWindowCount).toBe(windowCount + 1);

        // Get handle to new incognito window and switch to it
        handles = new Set(await driver.getAllWindowHandles());
        handles.delete(originalHandle);
        handles.delete(newWindow);
        const incognito = handles.values().next().value;
        await driver.switchTo().window(incognito);

        // <CS-w> closes the current window
        windowCount = await getWindowCount();
        await server.browserShortcut("<CS-w>");
        await windowCountChange(windowCount, "<CS-w> did not close any window the first time");
        newWindowCount = await getWindowCount();
        expect(newWindowCount).toBe(windowCount - 1);

        // incognito window has been closed, go back to the new window, close
        // it, go back to original window
        await driver.switchTo().window(newWindow);
        await driver.close();
        await driver.switchTo().window(originalHandle);

        // Now don't fall back to browser behavior
        const vimrcContent = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = {
        \\ 'globalSettings': {
                \\ '<C-n>': 'noop',
                \\ '<C-t>': 'noop',
                \\ '<C-w>': 'noop',
                \\ '<CS-n>': 'noop',
                \\ '<CS-t>': 'noop',
                \\ '<CS-w>': 'noop'
        \\ }
\\ }
${vimrcContent}`);
        await reloadNeovim(server, driver);
        tabCount = await getTabCount();
        windowCount = await getWindowCount();
        await server.browserShortcut("<C-n>");
        await server.browserShortcut("<C-n>");
        await server.browserShortcut("<C-n>");
        await server.browserShortcut("<C-t>");
        await server.browserShortcut("<C-t>");
        await server.browserShortcut("<C-w>");
        await server.browserShortcut("<CS-n>");
        await server.browserShortcut("<CS-w>");
        await driver.sleep(1000);
        newTabCount = await getTabCount();
        newWindowCount = await getWindowCount();
        expect(newTabCount).toBe(tabCount);
        expect(newWindowCount).toBe(windowCount);
}));

export const testMouse = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        await reloadNeovim(server, driver);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ["i"]);
        // Selenium doesn't let you simulate mouse wheel :(
        await driver.actions()
                .move({x: 10, y: 10, origin: input})
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .press(webdriver.Button.MIDDLE)
                .release(webdriver.Button.MIDDLE)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .press(webdriver.Button.RIGHT)
                .release(webdriver.Button.RIGHT)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.CONTROL)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .keyUp(webdriver.Key.CONTROL)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.META)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .keyUp(webdriver.Key.META)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.SHIFT)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .keyUp(webdriver.Key.SHIFT)
                .pause(500)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.ALT)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.META)
                .keyDown(webdriver.Key.SHIFT)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .keyUp(webdriver.Key.ALT)
                .keyUp(webdriver.Key.CONTROL)
                .keyUp(webdriver.Key.META)
                .keyUp(webdriver.Key.SHIFT)
                .pause(500) // pause required otherwise we might sendKeys too soon
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.ALT)
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .keyUp(webdriver.Key.ALT)
                .pause(500)
                .keyDown(webdriver.Key.ESCAPE)
                .keyUp(webdriver.Key.ESCAPE)
                .pause(500) // pause required otherwise we might sendKeys too soon
                .press(webdriver.Button.LEFT)
                .release(webdriver.Button.LEFT)
                .perform();
        await sendKeys(driver, [webdriver.Key.ESCAPE] // Yup, escape twice. Helps with instabilities.
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        const controlMouse = process.platform !== "darwin" ? "LeftMouse" : "RightMouse";
        expect(await input.getAttribute("value")).toBe(`<LeftMouse><MiddleMouse><RightMouse><C-${controlMouse}><D-LeftMouse><S-LeftMouse><M-C-S-D-${controlMouse}><M-LeftMouse>`);
}));

export const testUntrustedInput = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
nnoremap a aFirenvim let through an a in normal mode
inoremap a aFirenvim let through an a in insert mode
nnoremap <C-a> aFirenvim let through a C-a in normal mode
inoremap <C-a> aFirenvim let through a C-a in insert mode
${vimrcContent}`);
        await reloadNeovim(server, driver);
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await server.contentEval (frameSocket, `const target = document.getElementById("keyhandler");
target.value = "a";
[
    new KeyboardEvent("keydown",     { key: "a", bubbles: true }),
    new KeyboardEvent("keyup",       { key: "a", bubbles: true }),
    new KeyboardEvent("keypress",    { key: "a", bubbles: true }),
    new InputEvent("beforeinput", { data: "a", bubbles: true }),
    new InputEvent("input",       { data: "a", bubbles: true }),
    new InputEvent("change",      { data: "a", bubbles: true }),
    new KeyboardEvent("keydown",     { key: "a", ctrlKey: true, bubbles: true }),
    new KeyboardEvent("keyup",       { key: "a", ctrlKey: true, bubbles: true }),
    new KeyboardEvent("keypress",    { key: "a", ctrlKey: true, bubbles: true }),
].forEach(e => target.dispatchEvent(e));
target.value = "";
`);
        await sendKeys(driver, "ii".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim frame did not disappear!");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("i");
}));

export const testFilenameSettings = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = {
        \\ 'localSettings': {
                \\ '.*': {
                        \\ 'filename': 'hello_world_{timestamp}.txt',
                \\ }
        \\ }
\\ }
${vimrcContent}
                `);
        await reloadNeovim(server, driver);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await driver.actions()
                .keyDown("i")
                .keyUp("i")
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("r")
                .keyUp("r")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await sendKeys(driver, ["=expand('%')"]
                       .concat(webdriver.Key.ENTER)
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch("hello_world_2");
}));

export const testSyncSetting = retryTest(withLocalPage("simple.html", async (testTitle: string, server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = {
        \\ 'localSettings': {
                \\ '.*': {
                        \\ 'sync': 'change',
                \\ }
        \\ }
\\ }
${vimrcContent}
                `);
        await reloadNeovim(server, driver);
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ["iAutosync works"]
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("Autosync works");
}));

export async function killDriver(server: any, driver: webdriver.WebDriver) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
