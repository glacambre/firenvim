
import * as process from "process";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as webdriver from "selenium-webdriver";
const Until = webdriver.until;
const By = webdriver.By;
const WebElement = webdriver.WebElement;

export type logFunc = (...args: any[]) => void;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(15000);
const FIRENVIM_INIT_DELAY = 1000;

export const pagesDir = path.resolve(path.join("tests", "pages"));
export const extensionDir = path.resolve("target");

let firenvimReady = (driver: webdriver.WebDriver) => {
        return driver.wait(async () => {
                let firenvimReady = await driver.executeScript("return window.firenvimReady;");
                if (firenvimReady === true) {
                        // We need to set firenvimReady back to false otherwise
                        // opening multiple firenvim instances will result in
                        // Selenium believing that the second firenvim is ready
                        // before it actually is.
                        await driver.executeScript("window.firenvimReady = false");
                        return true;
                }
                return false;
        });
}

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

export async function loadLocalPage(driver: webdriver.WebDriver, page: string, title = "") {
        let error: Error;
        for (let i = 0; i < 3; ++i) {
                try {
                        await driver.get("file://" + path.join(pagesDir, page));
                        await driver.sleep(i * 10);
                        await driver.executeScript(`document.documentElement.focus();document.title=${JSON.stringify(title)}`);
                        return;
                } catch (e) {
                        error = e;
                }
        }
        throw error;
}

export async function testModifiers(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "Modifier test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
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
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not disappear");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(["\u0011<M-q><D-q><S-Left>", "\u0001<M-a><D-a><S-Left>"])
               .toContain(await input.getAttribute("value"));
}

export async function testGStartedByFirenvim(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "g:started_by_firenvim test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "Input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
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
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch("true");
}

export async function testCodemirror(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "codemirror.html", "CodeMirror test");
        let input = await driver.wait(Until.elementLocated(By.css("div.CodeMirror")), 5000, "Input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        const originalValue = (await input.getAttribute("innerText"));
        await driver.actions().click(input).perform();
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(3)")), 5000, "Firenvim span not found");
        await firenvimReady(driver);
        // Somehow there's a focus issue with this test. We actively attempt to
        // refocus the span if it isn't focused.
        for (let i = 0; i < 3; ++i) {
                if (WebElement.equals(span, await driver.executeScript("return document.activeElement"))) {
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
        await driver.wait(Until.stalenessOf(span), 5000, "Span handle did not go stale.");
        await driver.wait(async () => (await input.getAttribute("innerText")) != originalValue, 5000, "CodeMirror element's content did not change.");
        expect(await input.getAttribute("innerText")).toMatch(/Testhtml<!--/);
}

export async function testAce(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "ace.html", "Ace test");
        const input = await driver.wait(Until.elementLocated(By.css("#editor")), 5000, "Input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        const initialValue = await input.getAttribute("innerText");
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), 5000, "Firenvim span not found");
        await ready;
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
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span handle did not go stale");
        await driver.wait(async () => (await input.getAttribute("innerText")) != initialValue, 5000, "input value did not change");
        expect(await input.getAttribute("innerText")).toMatch(/Testjavascriptalert()/);
}

export async function testMonaco(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "monaco.html", "Monaco test");
        const input = await driver.wait(Until.elementLocated(By.css("#container")), 5000, "Input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        const originalValue = await input.getAttribute("innerText");
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(9)")), 5000, "Firenvim span not found");
        await ready;
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
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("innerText")) != originalValue, 5000, "Value did not change");
        expect(await input.getAttribute("innerText")).toMatch(/^1\n2\n3\nTesttypescriptfunction/);
}

export async function testDynamicTextareas(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "dynamic.html", "Dynamic textareas test");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")), 5000, "insert-textarea not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        await driver.actions().click(btn).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), 5000, "Firenvim span not found");
        await ready;
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > textarea")), 5000, "body > textarea not found");
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""), 5000, "Input alue did not change");
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

export async function testNestedDynamicTextareas(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "dynamic_nested.html", "Nested dynamic textareas");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")), 5000, "insert-textarea not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        await driver.actions().click(btn).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), 5000, "Firenvim span not found");
        await ready;
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > div:nth-child(3) > textarea:nth-child(1)")), 5000, "body > div:nth-child(3) > textarea:nth-child(1) not found");
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export async function reloadNeovim(driver: webdriver.WebDriver) {
        await driver.executeAsyncScript((callback: () => {}) => {
                window.addEventListener("firenvim-settingsUpdated", () => callback());
                window.dispatchEvent(new Event("firenvim-updateSettings"));
        });
}

export async function testVimrcFailure(driver: webdriver.WebDriver) {
        await writeVimrc("call");
        await reloadNeovim(driver);
        await loadLocalPage(driver, "simple.html", "Vimrc failure");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        try {
                const span = await driver.wait(
                        Until.elementLocated(By.css("body > span:nth-child(2)")),
                        1000,
                        "Element not found");
                // The firenvim frame should disappear after a second
                await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        } catch (e) {
                // We weren't fast enough to catch the frame appear/disappear,
                // that's ok
        }
}

export async function testGuifont(driver: webdriver.WebDriver) {
        const backup = await readVimrc();
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        await loadLocalPage(driver, "simple.html", "Guifont test");
        await reloadNeovim(driver);
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        let ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, "100aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat("^gjib".split(""))
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.sleep(100);
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        const initVal = await input.getAttribute("value");
        expect(initVal).toMatch(/a+ba+/);
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);
        await writeVimrc(backup);
        await reloadNeovim(driver);
        ready = firenvimReady(driver);
        await driver.actions().click(input).perform();
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, "^gjib".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== initVal), 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
}

export async function testPageFocus(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "PageFocus test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")), 5000, "Page focus did not change");
}

export async function testInputFocus(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "InputFocus test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), 5000, "Page focus did not change");
}

export async function testEvalJs(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "EvalJs test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, `:call firenvim#eval_js('document`.split(""));
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
        await sendKeys(driver, `046value = "Eval Works!"')`.split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value")) !== "", 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("Eval Works!");
}

export async function testPressKeys(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "chat.html", "PressKeys test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, "iHello".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":w".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":call firenvim#press_keys('<C-CR>')".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":q!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value")) === "Message sent!", 5000, "Input value did not change");
}

export async function testInputFocusedAfterLeave(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "Input focus after leave test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")), 5000, "Input element not focused after leaving frame");
};

export async function testFocusGainedLost(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "FocusGainedLost test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
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
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("a");
        await driver.actions().click(input).perform();
        await sendKeys(driver, ":wq!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value") !== "a"), 5000, "Input value did not change the second time");
        expect(await input.getAttribute("value")).toBe("ab");
}

export async function testTakeoverOnce(driver: webdriver.WebDriver) {
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        await loadLocalPage(driver, "simple.html", "takeover: once test");
        await reloadNeovim(driver);
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        const body = await driver.wait(Until.elementLocated(By.id("body")), 5000, "body not found");
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
}

export async function testTakeoverEmpty(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "takeover: once empty");
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'empty' } } }
${backup}
                `);
        await reloadNeovim(driver);
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        let ready = firenvimReady(driver);
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        // Makign sure that whitespace == empty
        await sendKeys(driver, "i".split("")
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) !== "", 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("\n\n\n");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        ready = firenvimReady(driver);
        await driver.actions().click(input).perform();
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        // Making sure that content != empty
        await sendKeys(driver, "gg^dGii".split("")
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) !== "\n\n\n", 5000, "Input value did not change the second time");
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
}

export async function testTakeoverNonEmpty(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "takeover: nonempty test");
        const backup = await readVimrc();
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'nonempty' } } }
${backup}
                `);
        await reloadNeovim(driver);
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
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
        const ready = firenvimReady(driver);
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
}

export async function testLargeBuffers(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "Large buffers test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript(`arguments[0].scrollIntoView(true);
                                   arguments[0].value = (new Array(5000)).fill("a").join("");`, input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
        await sendKeys(driver, "Aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value")) == (new Array(5001)).fill("a").join(""), 5000, "Input value did not change");
}

export async function testNoLingeringNeovims(driver: webdriver.WebDriver) {
        // Load neovim once and kill the tab, then load neovim again and kill
        // the frame.
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        let input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        await driver.actions().click(input).perform();
        let ready = firenvimReady(driver);
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        await driver.actions().click(input).perform();
        ready = firenvimReady(driver);
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "body > span:nth-child(2) not found");
        await ready;
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER))
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");

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
}

export async function testInputResizes(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "resize.html", "Input resize test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")), 5000, "body > span:nth-child(4) not found");
        await ready;
        await sendKeys(driver, "100aa".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat("^gjib".split(""))
                       .concat(webdriver.Key.ESCAPE));
        const button = await driver.wait(Until.elementLocated(By.id("button")), 5000, "button not found");
        await driver.actions().click(button).perform();
        await driver.actions().click(input).perform();
        await sendKeys(driver, "^gjib".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
};

export async function testResize(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "simple.html", "Resizing test");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "content-input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
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
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        const [lines, columns] = (await input.getAttribute("value"))
                .split("\n")
                .map((v: string) => parseInt(v));
        expect(lines).toBeLessThan(100);
        expect(columns).toBeLessThan(300);
}

export async function testWorksInFrame(driver: webdriver.WebDriver) {
        await loadLocalPage(driver, "parentframe.html", "Iframe test");
        const frame = await driver.wait(Until.elementLocated(By.id("frame")));
        driver.switchTo().frame(frame);
        const input = await driver.wait(Until.elementLocated(By.id("content-input")), 5000, "input not found");
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await driver.actions().click(input).perform();
        const ready = firenvimReady(driver);
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")), 5000, "Firenvim span not found");
        await ready;
        await sendKeys(driver, "aa".split("")
                .concat([webdriver.Key.ESCAPE])
                .concat(":wq".split(""))
                .concat([webdriver.Key.ENTER])
        );
        await driver.wait(Until.stalenessOf(span), 5000, "Firenvim span did not go stale.");
        await driver.wait(async () => (await input.getAttribute("value") !== ""), 5000, "Input value did not change");
        expect(await input.getAttribute("value")).toBe("a");
}

export async function killDriver(driver: webdriver.WebDriver) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
