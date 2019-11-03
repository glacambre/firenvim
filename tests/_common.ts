
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;

import { readVimrc, writeVimrc } from "./_vimrc";

jest.setTimeout(40000)

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

export async function sendKeys(driver: any, keys: any[]) {
        return keys.reduce((prom, key) => prom
                .then((action: any) => action.sendKeys(key))
                .then((action: any) => action.pause(keyDelay))
                , Promise.resolve(driver.actions())).then((action: any) => action.perform());
}

export async function testTxties(driver: any) {
        console.log("Navigating to txti.es…");
        await driver.get("http://txti.es");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(7)")));
        console.log("Sleeping for a sec…");
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
}

export async function testModifiers(driver: any) {
        console.log("Navigating to txti.es…");
        await driver.get("http://txti.es");
        console.log("Locating textarea…");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(7)")));
        console.log("Sleeping for a sec…");
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
        await driver.sleep(1000);
        await driver.wait(async () => ["\u0011<M-q><D-q>", "\u0001<M-a><D-a>"].includes(await input.getAttribute("value")));
}

export async function testCodemirror(driver: any) {
        console.log("Navigating to codemirror.net…");
        await driver.get("https://codemirror.net");
        console.log("Looking for codemirror div…");
        const input = await driver.wait(Until.elementLocated(By.css("div.CodeMirror")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(3)")));
        console.log("Sleeping for a sec…");
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
        console.log("Navigating to ace.c9.io…");
        await driver.get("https://ace.c9.io");
        console.log("Looking for ace div…");
        const input = await driver.wait(Until.elementLocated(By.css("div.ace_content")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(10)")));
        console.log("Sleeping for a sec…");
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
        await driver.wait(async () => /\/\*\*Test/.test(await input.getAttribute("innerText")));
}

export async function testVimrcFailure(driver: any) {
        // First, write buggy vimrc
        console.log("Backing up vimrc…");
        const backup = await readVimrc();
        console.log("Overwriting it…");
        await writeVimrc("call\n");
        // Then, use preloaded instance, so that firenvim preloads a buggy instance
        console.log("Navigating to txti.es…");
        await driver.get("http://txti.es");
        console.log("Locating textarea…");
        let input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        let span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(7)")));
        console.log("Sleeping for a sec…");
        await driver.sleep(1000);
        // We can restore our vimrc
        await writeVimrc(backup);
        // Reload, to get the buggy instance
        console.log("Navigating to txti.es…");
        await driver.get("http://txti.es");
        console.log("Locating textarea…");
        input = await driver.wait(Until.elementLocated(By.id("content-input")));
        await driver.executeScript("arguments[0].scrollIntoView(true);", input);
        console.log("Clicking on input…");
        await driver.actions().click(input).perform();
        console.log("Waiting for span to be created…");
        span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(7)")));
        // The firenvim frame should disappear after a second
        console.log("Waiting for span to disappear…");
        await driver.wait(Until.stalenessOf(span));
};

export async function killDriver(driver: any) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
