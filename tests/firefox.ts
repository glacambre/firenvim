require("geckodriver");

const env = require("process").env;
const fs = require("fs");
const path = require("path");
const webdriver = require("selenium-webdriver");
const Until = webdriver.until;
const By = webdriver.By;
const Options = require("selenium-webdriver/firefox").Options

import { extensionDir, getNewestFileMatching, sendKeys, testTxties, testCodemirror, testAce, killDriver } from "./_common"

describe("Firefox", () => {

        let driver: any = undefined

        beforeAll(async () => {
                const extensionPath = await getNewestFileMatching(path.join(extensionDir, "xpi"), ".*.zip");

                // Temporary workaround until
                // https://github.com/SeleniumHQ/selenium/pull/7464 is merged
                let xpiPath: string
                if (extensionPath !== undefined) {
                        xpiPath = extensionPath.replace(/\.zip$/, ".xpi");
                        fs.renameSync(extensionPath, xpiPath);
                } else {
                        xpiPath = await getNewestFileMatching(path.join(extensionDir, "xpi"), ".*.xpi");
                }

                const options = (new Options())
                        .setPreference("xpinstall.signatures.required", false)
                        .addExtensions(xpiPath);

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
                driver.getCapabilities().then((cap: any) => {
                        console.log(`${cap.getBrowserName()} ${cap.getBrowserVersion()} ${xpiPath}`);
                });
        });

        afterAll(() => killDriver(driver));

        test("Firenvim works on txti.es", () => testTxties(driver));
        test("Firenvim works on CodeMirror", () => testCodemirror(driver));
        test("Firenvim works on Ace", () => testAce(driver));
})
