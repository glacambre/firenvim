
const process = require("process");
const spawn = require("child_process").spawn;
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(15000);
const FIRENVIM_INIT_DELAY = 600;

export const pagesDir = path.resolve(path.join("tests", "pages"));
export const extensionDir = path.resolve("target");

let firenvimReady = (driver: any) => driver.sleep(FIRENVIM_INIT_DELAY);
// Replace firenvimReady with a function that accesses the firenvim frame and
// looks for elements that signal that Firenvim is connected to neovim.
// Only available on Firefox because Chrome doesn't support
// driver.switchTo().frame(…) for shadow dom elements?
export function optimizeFirenvimReady() {
        firenvimReady = async (driver: any) => {
                await driver.switchTo().frame(0);
                await driver.wait(Until.elementLocated(By.css("span.nvim_cursor")));
                return driver.switchTo().defaultContent();
        }
};

export function getNewestFileMatching(directory: string, pattern: string | RegExp) {
        return new Promise((resolve, reject) => {
                fs.readdir(directory, (err: Error, filenames: string[]) => {
                        if (err) {
                                return reject(err);
                        }
                        return resolve(filenames);
                })
                // Keep only files matching pattern
        }).then((names: string[]) => names.filter(name => name.match(pattern)))
        // Get their stat struct
                .then(names => Promise.all(names.map(name => new Promise((resolve, reject) => {
                        const fpath = path.join(directory, name)
                        fs.stat(fpath, (err: Error, stats: { path: string, mtime: number }) => {
                                if (err) {
                                        reject(err);
                                }
                                stats.path = fpath;
                                return resolve(stats);
                        })
                }))))
        // Sort by most recent and keep first
                .then((stats: any[]) => (stats.sort((stat1, stat2) => stat2.mtime - stat1.mtime)[0] || {}).path)
}

function sendKeys(driver: any, keys: any[]) {
        return keys.reduce((prom, key) => prom
                .then((action: any) => action.sendKeys(key))
                , Promise.resolve(driver.actions()))
            .then((action: any) => action.perform());
}

function loadLocalPage(driver: any, page: string, title = "") {
        return driver.get("file://" + path.join(pagesDir, page))
                .then(() => driver.executeScript(`document.documentElement.focus();document.title=${JSON.stringify(title)}`));
}

export async function testModifiers(driver: any) {
        await loadLocalPage(driver, "simple.html", "Modifier test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing <C-v><C-a><C-v><A-v><C-v><D-a><S-Left>…");
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
        console.log("Writing keycodes.");
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(["\u0011<M-q><D-q><S-Left>", "\u0001<M-a><D-a><S-Left>"])
               .toContain(await input.getAttribute("value"));
}

export async function testGStartedByFirenvim(driver: any) {
        await loadLocalPage(driver, "simple.html", "g:started_by_firenvim test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing a<C-r>=g:started_by_firenvim<CR><Esc>:wq<CR>…");
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
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        expect(await input.getAttribute("value")).toMatch("true");
}

export async function testCodemirror(driver: any) {
        await loadLocalPage(driver, "codemirror.html", "CodeMirror test");
        console.log("Looking for codemirror div…");
        const input = await driver.wait(Until.elementLocated(By.css("div.CodeMirror")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(3)")));
        await firenvimReady(driver);
        console.log("Typing stuff…");
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
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /Testhtml<!--/.test(await input.getAttribute("innerText")));
}

export async function testAce(driver: any) {
        await loadLocalPage(driver, "ace.html", "Ace test");
        console.log("Looking for ace div…");
        const input = await driver.wait(Until.elementLocated(By.css("#editor")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        console.log("Typing stuff…");
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
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /Testjavascriptalert()/.test(await input.getAttribute("innerText")));
}

export async function testMonaco(driver: any) {
        await loadLocalPage(driver, "monaco.html", "Monaco test");
        console.log("Looking for monaco div…");
        const input = await driver.wait(Until.elementLocated(By.css("#container")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(9)")));
        await firenvimReady(driver);
        console.log("Typing stuff…");
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
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /^1\n2\n3\nTesttypescriptfunction/.test(await input.getAttribute("innerText")));
}

export async function testDynamicTextareas(driver: any) {
        await loadLocalPage(driver, "dynamic.html", "Dynamic textareas test");
        console.log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        console.log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        console.log("Typing things…");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > textarea")));
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""));
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

export async function testNestedDynamicTextareas(driver: any) {
        await loadLocalPage(driver, "dynamic_nested.html", "Nested dynamic textareas");
        console.log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        console.log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        console.log("Typing things…");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        const txtarea = await driver.wait(Until.elementLocated(By.css("body > div:nth-child(3) > textarea:nth-child(1)")));
        await driver.wait(async () => (await txtarea.getAttribute("value") !== ""));
        expect(await txtarea.getAttribute("value")).toMatch("Test");
}

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export async function killPreloadedInstance(driver: any) {
        console.log("Killing preloaded instance.");
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

export async function testVimrcFailure(driver: any) {
        // First, write buggy vimrc
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc("call");
        await loadLocalPage(driver, "simple.html", "Vimrc failure");
        await killPreloadedInstance(driver);
        // Reload, to get the buggy instance
        await loadLocalPage(driver, "simple.html", "Vimrc failure");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        // We can restore our vimrc
        await writeVimrc(backup);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        // The firenvim frame should disappear after a second
        console.log("Waiting for span to disappear…");
        await driver.wait(Until.stalenessOf(span));
}

export async function testGuifont(driver: any) {
        await loadLocalPage(driver, "simple.html", "Guifont test");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        await killPreloadedInstance(driver);
        await loadLocalPage(driver, "simple.html", "Guifont test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        await writeVimrc(backup);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing 100aa<Esc>^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "100aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat("^gjib".split(""))
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        const initVal = await input.getAttribute("value");
        expect(initVal).toMatch(/a+ba+/);
        await driver.executeScript(`arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing ^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "^gjib".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => (await input.getAttribute("value") !== initVal));
        expect(await input.getAttribute("value")).toMatch(/a*ba+ba*/);
}

export async function testPageFocus(driver: any) {
        await loadLocalPage(driver, "simple.html", "PageFocus test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing :call firenvim#focus_page()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        console.log("Checking that the page is focused…");
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testInputFocus(driver: any) {
        await loadLocalPage(driver, "simple.html", "InputFocus test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing :call firenvim#focus_input()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        console.log(await driver.switchTo().activeElement().getAttribute("id"));
        console.log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testPressKeys(driver: any) {
        await loadLocalPage(driver, "chat.html", "PressKeys test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing iHello<Esc>:w<CR>:call firenvim#press_keys('<CR>')<CR>:q!<CR>…");
        await sendKeys(driver, "iHello".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":w".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":call firenvim#press_keys('<CR>')".split(""))
                .concat(webdriver.Key.ENTER)
                .concat(":q!".split(""))
                .concat(webdriver.Key.ENTER));
        console.log("Checking that the input contains 'Message sent!'…");
        await driver.wait(async () => (await input.getAttribute("value")) === "Message sent!");
}

export async function testInputFocusedAfterLeave(driver: any) {
        await loadLocalPage(driver, "simple.html", "Input focus after leave test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span));
        console.log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
};

export async function testFocusGainedLost(driver: any) {
        await loadLocalPage(driver, "simple.html", "FocusGainedLost test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing aa<Esc>:autocmd FocusLost * ++nested write<CR>…");
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
        console.log("Focusing body…");
        await driver.actions().click(await driver.wait(Until.elementLocated(By.css("html")))).perform();
        await driver.sleep(100);
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

export async function testTakeoverOnce(driver: any) {
        await loadLocalPage(driver, "simple.html", "takeover: once test");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        await killPreloadedInstance(driver);
        await loadLocalPage(driver, "simple.html", "takeover: once test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await writeVimrc(backup);
        console.log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        await driver.wait(Until.stalenessOf(span));
        console.log("Focusing body…");
        const body = await driver.wait(Until.elementLocated(By.id("body")));
        await driver.actions().click(body).perform();
        console.log("Focusing input again…");
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        console.log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame automatically created while disabled by config.");
                        }
                });
}

export async function testTakeoverEmpty(driver: any) {
        await loadLocalPage(driver, "simple.html", "takeover: once empty");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'empty' } } }
${backup}
                `);
        await killPreloadedInstance(driver);
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing ii<Esc>:wq!<CR>…");
        await sendKeys(driver, "ii".split("")
            .concat(webdriver.Key.ESCAPE)
            .concat(":wq!".split(""))
            .concat(webdriver.Key.ENTER));
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        await writeVimrc(backup);
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) === "i");
        console.log("Focusing input again…");
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        console.log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
}

export async function testTakeoverNonEmpty(driver: any) {
        await loadLocalPage(driver, "simple.html", "takeover: nonempty test");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'takeover': 'nonempty' } } }
${backup}
                `);
        await killPreloadedInstance(driver);
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        await driver.sleep(FIRENVIM_INIT_DELAY);
        console.log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
        await writeVimrc(backup);
        console.log("Setting input value.");
        await driver.executeScript(`arguments[0].value = 'i';
                                    arguments[0].blur();
                                    document.documentElement.focus();
                                    document.body.focus();`, input);
        console.log("Focusing input again…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER));
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
}

export async function testLargeBuffers(driver: any) {
        await loadLocalPage(driver, "simple.html", "Large buffers test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true);
                                   arguments[0].value = (new Array(5000)).fill("a").join("");`, input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await sendKeys(driver, "Aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) == (new Array(5001)).fill("a").join(""));
}

export async function testNoLingeringNeovims(driver: any) {
        // Load neovim once and kill the tab, then load neovim again and kill
        // the frame.
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        console.log("Locating textarea…");
        let input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Reloading page…");
        await loadLocalPage(driver, "simple.html", "No lingering neovims test");
        console.log("Locating textarea…");
        input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true)`, input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        await sendKeys(driver, ":q!".split("").concat(webdriver.Key.ENTER))
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));

        await (new Promise(resolve => setTimeout(resolve, 1000)));

        // All npm packages that promise to return the child process tree do so
        // by parsing the output of `ps` or of its windows equivalent. I find
        // completely insane that there's no better way to do this and since
        // there isn't, there's no point in depending on these packages.
        const pstree = spawn("pstree", [process.pid]);
        const data: string = await (new Promise(resolve => {
                let data = "";
                pstree.stdout.on("data", (d: any) => data += d);
                pstree.on("close", () => resolve(data));
        }));
        const match = data.match(/-(\d+\*)?[{\[]?nvim[\]}]?/)
        expect(match[1]).toBe(undefined);
}

export async function testInputResizes(driver: any) {
        await loadLocalPage(driver, "resize.html", "Input resize test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await firenvimReady(driver);
        console.log("Typing 100aa<Esc>^gjib…");
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

export async function testResize(driver: any) {
        await loadLocalPage(driver, "simple.html", "Resizing test");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await firenvimReady(driver);
        console.log("Trying to get the largest possible frame"),
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
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value") !== ""));
        const [lines, columns] = (await input.getAttribute("value"))
                .split("\n")
                .map((v: string) => parseInt(v));
        expect(lines).toBeLessThan(100);
        expect(columns).toBeLessThan(300);
}


export async function killDriver(driver: any) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
