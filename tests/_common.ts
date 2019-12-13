
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(40000)

export const pagesDir = path.resolve(path.join("tests", "pages"));
export const extensionDir = path.resolve("target");

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

const keyDelay = 100;

function sendKeys(driver: any, keys: any[]) {
        return keys.reduce((prom, key) => prom
                .then((action: any) => action.sendKeys(key))
                .then((action: any) => action.pause(keyDelay))
                , Promise.resolve(driver.actions())).then((action: any) => action.perform());
}

function loadLocalPage(driver: any, page: string) {
        return driver.get("file://" + path.join(pagesDir, page))
                .then(() => driver.executeScript("document.documentElement.focus()"));
}

export async function testModifiers(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing <C-v><C-a><C-v><A-v><C-v><D-a>…");
        await driver.actions()
                .keyDown("a")
                .keyUp("a")
                .pause(keyDelay)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .pause(keyDelay)
                .keyDown("a")
                .keyUp("a")
                .pause(keyDelay)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .pause(keyDelay)
                .keyDown(webdriver.Key.ALT)
                .keyDown("a")
                .keyUp("a")
                .keyUp(webdriver.Key.ALT)
                .pause(keyDelay)
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("v")
                .keyUp("v")
                .keyUp(webdriver.Key.CONTROL)
                .pause(keyDelay)
                .keyDown(webdriver.Key.COMMAND)
                .keyDown("a")
                .keyUp("a")
                .keyUp(webdriver.Key.COMMAND)
                .pause(keyDelay)
                .perform();
        await driver.sleep(1000);
        console.log("Writing keycodes.");
        await sendKeys(driver, [webdriver.Key.ESCAPE]
                       .concat(":wq!".split(""))
                       .concat(webdriver.Key.ENTER))
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => ["\u0011<M-q><D-q>", "\u0001<M-a><D-a>"].includes(await input.getAttribute("value")));
}

export async function testCodemirror(driver: any) {
        await loadLocalPage(driver, "codemirror.html");
        console.log("Looking for codemirror div…");
        const input = await driver.wait(Until.elementLocated(By.css("div.CodeMirror")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(3)")));
        await driver.sleep(1000);
        console.log("Typing stuff…");
        await sendKeys(driver, "iTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /Test<!--/.test(await input.getAttribute("innerText")));
}

export async function testAce(driver: any) {
        await loadLocalPage(driver, "ace.html");
        console.log("Looking for ace div…");
        const input = await driver.wait(Until.elementLocated(By.css("#editor")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await driver.sleep(1000);
        console.log("Typing stuff…");
        await sendKeys(driver, "ATest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /some textTest/.test(await input.getAttribute("innerText")));
}

export async function testMonaco(driver: any) {
        await loadLocalPage(driver, "monaco.html");
        console.log("Looking for monaco div…");
        const input = await driver.wait(Until.elementLocated(By.css("#container")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(9)")));
        await driver.sleep(1000);
        console.log("Typing stuff…");
        await sendKeys(driver, "iTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => /^1\n2\n3\nTestfunction/.test(await input.getAttribute("innerText")));
}

export async function testDynamicTextareas(driver: any) {
        await loadLocalPage(driver, "dynamic.html");
        console.log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        console.log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await driver.sleep(1000);
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
        await driver.wait(async () => (await txtarea.getAttribute("value")) === "Test");
}

export async function testNestedDynamicTextareas(driver: any) {
        await loadLocalPage(driver, "dynamic_nested.html");
        console.log("Locating button…");
        const btn = await driver.wait(Until.elementLocated(By.id("insert-textarea")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
        console.log("Clicking on btn…");
        await driver.actions().click(btn).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(4)")));
        await driver.sleep(1000);
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
        await driver.wait(async () => (await txtarea.getAttribute("value")) === "Test");
}

// Purges a preloaded instance by creating a new frame, focusing it and quitting it
export async function killPreloadedInstance(driver: any) {
        console.log("Killing preloaded instance.");
        const id = "firenvim-" + Math.round(Math.random() * 1000);
        await driver.executeScript(`
                const txtarea = document.createElement("textarea");
                txtarea.id = "${id}";
                document.body.appendChild(txtarea);
                txtarea.scrollIntoView(true);`);
        const txtarea = await driver.wait(Until.elementLocated(By.id(id)));
        await driver.actions().click(txtarea).perform();
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("e")
                .pause(keyDelay)
                .keyUp("e")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        await driver.sleep(1000);
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
        await loadLocalPage(driver, "simple.html");
        await killPreloadedInstance(driver);
        // We can restore our vimrc
        await writeVimrc(backup);
        // Reload, to get the buggy instance
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        // The firenvim frame should disappear after a second
        console.log("Waiting for span to disappear…");
        await driver.wait(Until.stalenessOf(span));
}

export async function testManualNvimify(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = {
    \\ 'localSettings': {
        \\ '.*': {
            \\ 'selector': '',
            \\ 'priority': 0,
        \\ }
    \\ }
\\ }
${backup}
                `);
        await killPreloadedInstance(driver);
        await loadLocalPage(driver, "simple.html");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Making sure a frame didn't pop up.");
        await driver.sleep(1000);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame automatically created while disabled by config.");
                        }
                });
        await driver.actions()
                .keyDown(webdriver.Key.CONTROL)
                .keyDown("e")
                .pause(keyDelay)
                .keyUp("e")
                .keyUp(webdriver.Key.CONTROL)
                .perform();
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing things…");
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER)
        );
        console.log("Waiting for span to be removed…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) === "Test");
        // Unfocus element
        await driver.executeScript("arguments[0].blur();", input);
        await driver.sleep(1000);
        await driver.actions().click(input).perform();
        console.log("Making sure a frame didn't pop up.");
        await driver.sleep(1000);
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame automatically created while disabled by config.");
                        }
                });
        await writeVimrc(backup);
        await killPreloadedInstance(driver);
}

export async function testGuifont(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
set guifont=monospace:h50
${backup}
                `);
        await killPreloadedInstance(driver);
        await writeVimrc(backup);
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing 30aa<Esc>^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "30aa".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat("^gjib".split(""))
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        await driver.wait(async () => /a+ba+/.test(await input.getAttribute("value")));
        await driver.executeScript("arguments[0].blur();", input);
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing ^gjib<Esc>:wq!<Enter>…");
        await sendKeys(driver, "^gjib".split("")
                .concat(webdriver.Key.ESCAPE)
                .concat(":wq!".split(""))
                .concat(webdriver.Key.ENTER));
        // We don't test for a specific value because size is dependant on browser config
        await driver.wait(async () => /a*ba+ba*/.test(await input.getAttribute("value")));
}

export async function testPageFocus(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing :call firenvim#focus_page()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_page()".split("")
                .concat(webdriver.Key.ENTER));
        console.log("Checking that the page is focused…");
        await driver.wait(async () => ["html", "body"].includes(await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testInputFocus(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing :call firenvim#focus_input()<CR>…");
        await sendKeys(driver, ":call firenvim#focus_input()".split("")
                .concat(webdriver.Key.ENTER));
        console.log(await driver.switchTo().activeElement().getAttribute("id"));
        console.log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
}

export async function testPressKeys(driver: any) {
        await loadLocalPage(driver, "chat.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
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
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        console.log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        console.log(await driver.switchTo().activeElement().getAttribute("id"));
        console.log("Checking that the input is focused…");
        await driver.wait(async () => "content-input" === (await driver.switchTo().activeElement().getAttribute("id")));
};

export async function testTakeoverOnce(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc(`
let g:firenvim_config = { 'localSettings': { '.*': { 'selector': 'textarea', 'takeover': 'once' } } }
${backup}
                `);
        await killPreloadedInstance(driver);
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        await writeVimrc(backup);
        console.log("Typing :q!<CR>…");
        await sendKeys(driver, ":q!".split("")
                .concat(webdriver.Key.ENTER));
        console.log("Focusing body…");
        const body = await driver.wait(Until.elementLocated(By.id("body")));
        await driver.actions().click(body).perform();
        await driver.sleep(1000);
        console.log("Focusing input again…");
        await driver.actions().click(input).perform();
        await driver.sleep(1000);
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
        await loadLocalPage(driver, "simple.html");
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
        await driver.sleep(1000);
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
        await driver.sleep(1000);
        console.log("Making sure span didn't pop up.");
        await driver.findElement(By.css("body > span:nth-child(2)"))
                .catch((): void => undefined)
                .then((e: any) => {
                        if (e !== undefined) {
                                throw new Error("Frame created while takeover = empty!.");
                        }
                });
}

export async function testLargeBuffers(driver: any) {
        await loadLocalPage(driver, "simple.html");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript(`arguments[0].scrollIntoView(true);
                                   arguments[0].value = (new Array(10000)).fill("a").join("");`, input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(2)")));
        await driver.sleep(1000);
        await sendKeys(driver, ":wq!".split("").concat(webdriver.Key.ENTER))
        console.log("Waiting for span to be removed from page…");
        await driver.wait(Until.stalenessOf(span));
        console.log("Waiting for value update…");
        await driver.wait(async () => (await input.getAttribute("value")) == (new Array(10000)).fill("a").join(""));
}

export async function killDriver(driver: any) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
