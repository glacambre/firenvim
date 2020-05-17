
import * as process from "process";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as webdriver from "selenium-webdriver";
const Until = webdriver.until;
const By = webdriver.By;

export type logFunc = (...args: any[]) => void;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(15000);
const FIRENVIM_INIT_DELAY = 1000;

export const pagesDir = path.resolve(path.join("tests", "pages"));
export const extensionDir = path.resolve("target");

let firenvimReady = (driver: webdriver.WebDriver) => driver.sleep(FIRENVIM_INIT_DELAY);
// Replace firenvimReady with a function that accesses the firenvim frame and
// looks for elements that signal that Firenvim is connected to neovim.
// Only available on Firefox because Chrome doesn't support
// driver.switchTo().frame(…) for shadow dom elements?
export function optimizeFirenvimReady() {
        firenvimReady = async (driver: webdriver.WebDriver) => {
                await driver.switchTo().frame(0);
                await driver.wait(Until.elementLocated(By.css("span.nvim_cursor")));
                return driver.switchTo().defaultContent();
        }
};

export async function getNewestFileMatching(directory: string, pattern: string | RegExp) {
        const names = ((await new Promise((resolve, reject) => {
                fs.readdir(directory, (err: Error, filenames: string[]) => {
                        if (err) {
                                return reject(err);
                        }
                        return resolve(filenames);
                })
                // Keep only files matching pattern
        })) as string[]).filter(name => name.match(pattern));
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
        await driver.get("file://" + path.join(pagesDir, page));
        return driver.executeScript(`document.documentElement.focus();document.title=${JSON.stringify(title)}`);
}

export async function testModifiers(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "Modifier test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing <C-v><C-a><C-v><A-v><C-v><D-a><S-Left>…");
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
        log("Writing keycodes.");
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(["\u0011<M-q><D-q><S-Left>", "\u0001<M-a><D-a><S-Left>"])
               .toContain(await input.getAttribute("value"));
}

export async function testGStartedByFirenvim(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "g:started_by_firenvim test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing a<C-r>=g:started_by_firenvim<CR><Esc>:wq<CR>…");
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
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(await input.getAttribute("value")).toMatch("true");
}

export async function testCodemirror(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "codemirror.html", "CodeMirror test");
        log("Looking for codemirror div…");
        const input = await driver.wait(Until.elementLocated(By.css("div.CodeMirror")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(3)")));
        await firenvimReady(driver);
        log("Typing stuff…");
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
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => /Testhtml<!--/.test(await input.getAttribute("innerText")));
}

export async function testAce(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "ace.html", "Ace test");
        log("Looking for ace div…");
        const input = await driver.wait(Until.elementLocated(By.css("#editor")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        log("Typing stuff…");
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
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => /Testjavascriptalert()/.test(await input.getAttribute("innerText")));
}

export async function testMonaco(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "monaco.html", "Monaco test");
        log("Looking for monaco div…");
        const input = await driver.wait(Until.elementLocated(By.css("#container")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(9)")));
        await firenvimReady(driver);
        log("Typing stuff…");
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
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => /^1\n2\n3\nTesttypescriptfunction/.test(await input.getAttribute("innerText")));
}

export async function testDynamicTextareas(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "dynamic.html", "Dynamic textareas test");
        log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        log("Typing things…");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        log("Waiting for span to be removed…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > textarea")));
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""));
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

export async function testNestedDynamicTextareas(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "dynamic_nested.html", "Nested dynamic textareas");
        log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        log("Typing things…");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        log("Waiting for span to be removed…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > div:nth-child(3) > textarea:nth-child(1)")));
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""));
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export async function killPreloadedInstance(driver: webdriver.WebDriver, log: logFunc) {
        log("Killing preloaded instance.");
        const id = "firenvim-" + Math.round(Math.random() * 500);
        await driver.executeScript(`
                const txtarea = document.createElement("textarea");
                txtarea.id = "${id}";
                document.body.appendChild(txtarea);
                txtarea.scrollIntoView(true);`);
        const txtarea = await driver.wait(Until.elementLocated(By.id(id)));
        await driver.actions().click(txtarea).perform();
        await sendKeys(driver, ["a"]);
        await driver.actions().click(txtarea).perform();
        await firenvimReady(driver);
        await driver.executeScript(`
                const elem = document.getElementById("${id}");
                elem.parentElement.removeChild(elem);
        `);
}

export async function testVimrcFailure(driver: webdriver.WebDriver, log: logFunc) {
        // First, write buggy vimrc
        log("Backing up vimrc…");
        const backup = await readVimrc();
        log("Overwriting it…");
        await writeVimrc("call");
        await loadLocalPage(driver, "simple.html", "Vimrc failure");
        await killPreloadedInstance(driver, log);
        // Reload, to get the buggy instance
        await loadLocalPage(driver, "simple.html", "Vimrc failure");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        // We can restore our vimrc
        await writeVimrc(backup);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        // The firenvim frame should disappear after a second
        log("Waiting for span to disappear…");
        await driver.wait(Until.stalenessOf(span));
}

export async function testGuifont(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "Guifont test");
        log("Backing up vimrc…");
        const backup = await readVimrc();
        log("Overwriting it…");
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        await killPreloadedInstance(driver, log);
        await loadLocalPage(driver, "simple.html", "Guifont test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await writeVimrc(backup);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing 100aa<Esc>^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "100aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat("^gjib".split(""))
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.sleep(100);
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        const initVal = await input.getAttribute("value");
        expect(initVal).toMatch(/a+ba+/);
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing ^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "^gjib".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== initVal));
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
}

export async function testPageFocus(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "PageFocus test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing :call firenvim#focus_page()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        log("Checking that the page is focused…");
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testInputFocus(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "InputFocus test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing :call firenvim#focus_input()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        log(await driver.switchTo().activeElement().getAttribute("id"));
        log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testEvalJs(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "EvalJs test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing iHello<Esc>:w<CR>:call firenvim#press_keys('<CR>')<CR>:q!<CR>…");
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
        await driver.wait(async () => (await input.getAttribute("value")) !== "");
        expect(await input.getAttribute("value")).toBe("Eval Works!");
}

export async function testPressKeys(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "chat.html", "PressKeys test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing iHello<Esc>:w<CR>:call firenvim#press_keys('<CR>')<CR>:q!<CR>…");
        await sendKeys(driver, "iHello".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":w".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":call firenvim#press_keys('<CR>')".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":q!".split(""))
                .concat(webdriver.Key.ENTER));
        log("Checking that the input contains 'Message sent!'…");
        await driver.wait(async () => (await input.getAttribute("value")) === "Message sent!");
}

export async function testInputFocusedAfterLeave(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "Input focus after leave test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span));
        log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
};

export async function testFocusGainedLost(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "FocusGainedLost test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing aa<Esc>:autocmd FocusLost * ++nested write<CR>…");
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
        log("Focusing body…");
        await driver.executeScript(`document.activeElement.blur();
                                    document.documentElement.focus();
                                    document.body.focus();`);
        expect(["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")))
                .toBe(true);
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(await input.getAttribute("value")).toBe("a");
        await driver.actions().click(input).perform();
        await sendKeys(driver, ":wq!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value") !== "a"));
        expect(await input.getAttribute("value")).toBe("ab");
}

export async function testTakeoverOnce(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "takeover: once test");
        log("Backing up vimrc…");
        const backup = await readVimrc();
        log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        await killPreloadedInstance(driver, log);
        await loadLocalPage(driver, "simple.html", "takeover: once test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await writeVimrc(backup);
        log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span));
        log("Focusing body…");
        const body = await driver.wait(Until.elementLocated(By.id("body")));
        await driver.actions().click(body).perform();
        log("Focusing input again…");
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame automatically created while disabled by config.");
                        }
                });
}

export async function testTakeoverEmpty(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "takeover: once empty");
        log("Backing up vimrc…");
        const backup = await readVimrc();
        log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'empty' } } }
${backup}
                `);
        await killPreloadedInstance(driver, log);
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing ii<Esc>:wq!<CR>…");
        await sendKeys(driver, "i".split("")
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ENTER)
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        await driver.wait(async () => (await input.getAttribute("value")) !== "");
        expect(await input.getAttribute("value")).toBe("\n\n\n");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing ii<Esc>:wq!<CR>…");
        await sendKeys(driver, "gg^dGii".split("")
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        await writeVimrc(backup);
        log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) !== "\n\n\n");
        expect(await input.getAttribute("value")).toBe("i");
        log("Focusing input again…");
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
}

export async function testTakeoverNonEmpty(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "takeover: nonempty test");
        log("Backing up vimrc…");
        const backup = await readVimrc();
        log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'nonempty' } } }
${backup}
                `);
        await killPreloadedInstance(driver, log);
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
        await writeVimrc(backup);
        log("Setting input value.");
        await driver.executeScript(`arguments[0].value = 'i';
                                    arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        log("Focusing input again…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
}

export async function testLargeBuffers(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "Large buffers test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true);
                                   arguments[0].value = (new Array(5000)).fill("a").join("");`, input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await sendKeys(driver, "Aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) == (new Array(5001)).fill("a").join(""));
}

export async function testNoLingeringNeovims(driver: webdriver.WebDriver, log: logFunc) {
        // Load neovim once and kill the tab, then load neovim again and kill
        // the frame.
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        log("Locating textarea…");
        let input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Reloading page…");
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        log("Locating textarea…");
        input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER))
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));

        await (new Promise(resolve => setTimeout(resolve, 1000)));

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

export async function testInputResizes(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "resize.html", "Input resize test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        log("Typing 100aa<Esc>^gjib…");
        await sendKeys(driver, "100aa".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat("^gjib".split(""))
                       .concat(webdriver.Key.ESCAPE));
        const button = await driver.wait(Until.elementLocated(By.id("button")));
        await driver.actions().click(button).perform();
        await driver.actions().click(input).perform();
        await sendKeys(driver, "^gjib".split("")
                       .concat(webdriver.Key.ESCAPE)
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
};

export async function testResize(driver: webdriver.WebDriver, log: logFunc) {
        await loadLocalPage(driver, "simple.html", "Resizing test");
        log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        log("Clicking on input…");
        await driver.actions().click(input).perform();
        log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        log("Trying to get the largest possible frame"),
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
        log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        const [lines, columns] = (await input.getAttribute("value"))
                .split("\n")
                .map((v: string) => parseInt(v));
        expect(lines).toBeLessThan(100);
        expect(columns).toBeLessThan(300);
}


export async function killDriver(driver: webdriver.WebDriver) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
