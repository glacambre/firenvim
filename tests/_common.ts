
const env = require("process").env;
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;

jest.setTimeout(20000)

export const extensionDir = "./target";

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

export async function sendKeys(driver: any, keys: any[]) {
        return keys.reduce((prom, key) => prom
                .then((action: any) => action.sendKeys(key))
                .then((action: any) => action.pause(50))
                , Promise.resolve(driver.actions())).then((action: any) => action.perform());
}

export async function performTest(driver: any) {
        await driver.get("http://txti.es");
        console.log("txti.es navigated to.");
        const input = await driver.wait(Until.elementLocated(By.id("content-input")));
        console.log("Found text area.");
        await driver.actions().click(input).perform();
        console.log("Text area clicked on.");
        const span = await driver.wait(Until.elementLocated(By.css("body > span:nth-child(7)")));
        console.log("Waited for span to be created.");
        await driver.sleep(1000);
        await sendKeys(driver, "aTest".split("")
                .concat(webdriver.Key.ESCAPE));
        await driver.sleep(1000);
        await sendKeys(driver, ":wq!".split("")
                .concat(webdriver.Key.ENTER));
        console.log("Typed stuff.");
        await driver.wait(async () => (await input.getAttribute("value")) === "Test");
        console.log("Waited for value update.");
}

export async function killDriver(driver: any) {
        try {
                await driver.close()
        } catch(e) {}
        try {
                await driver.quit()
        } catch(e) {}
}
