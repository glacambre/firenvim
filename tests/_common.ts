
import * as process from "process";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as webdriver from "selenium-webdriver";
const Until = webdriver.until;
const By = webdriver.By;

import * as coverageServer from "./_coverageserver";
type Server = typeof coverageServer;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(15000);
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
                .then((action: any) => action.sendKeys(key))
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

const testFailuresDirectory = path.join(process.cwd(), "failures");
fs.rmdirSync(testFailuresDirectory, { recursive: true });
fs.mkdirSync(testFailuresDirectory, { recursive: true });
let testCount = 0;
function screenShotOnFail(f: (server: any, driver: webdriver.WebDriver) => Promise<void>) {
        return async (server: any, driver: webdriver.WebDriver) => {
                testCount += 1;
                let result: void;
                let error: Error;
                let failures = 0;
                let attempts = 0;
                for (attempts = 0; attempts == failures && attempts < 5; ++attempts) {
                        try {
                                result = await f(server, driver);
                        } catch (e) {
                                failures += 1;
                                error = e;
                                const b64 = await driver.takeScreenshot();
                                const buff = Buffer.from(b64, 'base64');
                                const p = path.join(testFailuresDirectory, "" + testCount);
                                fs.writeFileSync(p + ".png", buff);
                                fs.writeFileSync(p + ".txt", e.stack.toString());
                        }
                }
                if (attempts == failures) {
                        throw error;
                }
                return result;
        }
}

export const testModifiers = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Modifier test");
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await driver.actions()
                .keyDown("a")
                .keyUp("a")
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyDown("a")
                .keyUp("a")
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.ALT)
                .keyDown("a")
                .keyUp("a")
                .keyUp(webdriver.Key.ALT)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.COMMAND)
                .keyDown("a")
                .keyUp("a")
                .keyUp(webdriver.Key.COMMAND)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .keyDown(webdriver.Key.SHIFT)
                .keyDown(webdriver.Key.ARROW_LEFT)
                .keyDown(webdriver.Key.ARROW_LEFT)
                .keyUp(webdriver.Key.SHIFT)
                .perform();
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        await server.pullCoverageData(contentSocket);
        expect(["\u0011<M-q><D-q><S-Left>", "\u0001<M-a><D-a><S-Left>"])
               .toContain(await input.getAttribute("value"));
});

export const testUnfocusedKillEditor = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Unfocused test");
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":w | call firenvim#focus_page() | q".split("")
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear");
        expect(["HTML", "BODY"])
               .toContain(await driver.executeScript("return document.activeElement.tagName;"));
        await server.pullCoverageData(contentSocket);
});

export const testGStartedByFirenvim = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "g:started_by_firenvim test");
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
        await server.pullCoverageData(contentSocket);
        expect(await input.getAttribute("value")).toMatch("true");
});

export const testCodemirror = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "codemirror.html", "CodeMirror test");
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
        await server.pullCoverageData(contentSocket);
        expect(await input.getAttribute("innerText")).toMatch(/Testhtml<!--/);
});

export const testAce = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "ace.html", "Ace test");
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
        await server.pullCoverageData(contentSocket);
        expect(await input.getAttribute("innerText")).toMatch(/Testjavascriptalert()/);
});

export const testMonaco = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "monaco.html", "Monaco test");
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
        await server.pullCoverageData(contentSocket);
        expect(await input.getAttribute("innerText")).toMatch(/^1\n2\n3\nTesttypescriptfunction/);
});

export const testDynamicTextareas = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "dynamic.html", "Dynamic textareas test");
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
        await server.pullCoverageData(contentSocket);
        expect(await txtarea.getAttribute("value")).toMatch("Test");
});

export const testNestedDynamicTextareas = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "dynamic_nested.html", "Nested dynamic textareas");
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
        await server.pullCoverageData(contentSocket);
        expect(await txtarea.getAttribute("value")).toMatch("Test");
});

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export function reloadNeovim(server: any, driver: webdriver.WebDriver) {
        return server.updateSettings();
}

export const testVimrcFailure = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        await writeVimrc("call");
        await reloadNeovim(server, driver);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Vimrc failure");
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
        await server.pullCoverageData(contentSocket);
});

export const testGuifont = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Guifont test");
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
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);
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
        await server.pullCoverageData(contentSocket);
});

export const testPageFocus = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "PageFocus test");
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Page focus did not change");
        await server.pullCoverageData(contentSocket);
        await server.pullCoverageData(frameSocket);
});

export const testInputFocus = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "InputFocus test");
        const [input, span, frameSocket] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Page focus did not change");
        await server.pullCoverageData(contentSocket);
        await server.pullCoverageData(frameSocket);
});

export const testEvalJs = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "EvalJs test");
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
        expect(await input.getAttribute("value")).toBe("Eval Works!");
        await server.pullCoverageData(contentSocket);
        await server.pullCoverageData(frameSocket);
});

export const testPressKeys = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "chat.html", "PressKeys test");
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, "iHello".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":w".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":call firenvim#press_keys('<C-CR>')".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":q!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value")).startsWith("Message sent!"), WAIT_DELAY, "Input value did not change");
        await server.pullCoverageData(contentSocket);
});

export const testInputFocusedAfterLeave = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Input focus after leave test");
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await server.pullCoverageData(contentSocket);
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), WAIT_DELAY, "Input element not focused after leaving frame");
});;

export const testFocusGainedLost = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "FocusGainedLost test");
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
        await server.pullCoverageData(contentSocket);
        expect(await input.getAttribute("value")).toBe("ab");
});

export const testTakeoverOnce = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "takeover: once test");
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
        await server.pullCoverageData(contentSocket);
});

export const testTakeoverEmpty = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'empty' } } }
${backup}
                `);
        await reloadNeovim(server, driver);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "takeover: once empty");
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
        await server.pullCoverageData(contentSocket);
});

export const testTakeoverNonEmpty = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'nonempty' } } }
${backup}
                `);
        await reloadNeovim(server, driver);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "takeover: nonempty test");
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
        await driver.actions().click(input).perform();
        const [_, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not go stale.");
        await server.pullCoverageData(contentSocket);
});

export const testLargeBuffers = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Large buffers test");
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
        await server.pullCoverageData(contentSocket);
});

export const testNoLingeringNeovims = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        // Load neovim once and kill the tab, then load neovim again and kill
        // the frame.
        let contentSocket = await loadLocalPage(server, driver, "simple.html", "No lingering neovims test");
        let [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        await server.pullCoverageData(contentSocket);
        contentSocket = await loadLocalPage(server, driver, "simple.html", "No lingering neovims test");
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

export const testInputResizes = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "resize.html", "Input resize test");
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
        await server.pullCoverageData(contentSocket);
});;

export const testResize = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Resizing test");
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
        await server.pullCoverageData(contentSocket);
});

// /!\ NO CONTENT COVERAGE FOR THIS TEST! /!\
// This is because the inner frames creates a second content socket and we
// don't know how to deal with that...
export const testWorksInFrame = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "parentframe.html", "Iframe test");
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
        await server.pullCoverageData(contentSocket);
});

export const testIgnoreKeys = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const vimrcContent = await readVimrc();
        await writeVimrc(`
nnoremap <C-1> i<LT>C-1><Esc>
nnoremap <C-2> i<LT>C-2><Esc>
inoremap <C-1> <LT>C-1>
inoremap <C-2> <LT>C-2>
inoremap <C-3> <LT>C-3>
inoremap <C-4> <LT>C-4>
let g:firenvim_config = {
        \\ 'globalSettings': {
                \\ 'ignoreKeys': {
                        \\ 'normal': ['<C-1>'],
                        \\ 'insert': ['<C-2>', '<C-3>'],
                \\ }
        \\ }
\\ }
${vimrcContent}
                `);
        await reloadNeovim(server, driver);
        const contentSocket = await loadLocalPage(server, driver, "simple.html", "Key passthrough test");
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
        await server.pullCoverageData(contentSocket);
});

export const testContentEditable = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
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
        const contentSocket = await loadLocalPage(server, driver, "contenteditable.html", "Contenteditable test");
        const [input, span] = await createFirenvimFor(server, driver, By.id("content-input"));
        const innerText = await input.getAttribute("innerText");
        const innerHTML = await input.getAttribute("innerHTML");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
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

export const testDisappearing = screenShotOnFail(async (server: any, driver: webdriver.WebDriver) => {
        const contentSocket = await loadLocalPage(server, driver, "disappearing.html", "Modifier test");
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
                       .concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), WAIT_DELAY, "Firenvim span did not disappear the second time");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), WAIT_DELAY, "Input value did not change");
        expect("works").toBe(await input.getAttribute("value"));
        await server.pullCoverageData(contentSocket);
});


export async function killDriver(server: any, driver: webdriver.WebDriver) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
