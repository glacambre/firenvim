import { exec } from "child_process";
import * as fs from "fs";
import * as process from "process";
const env = process.env;
import * as path from "path";
import * as webdriver from "selenium-webdriver";
import { Options } from "selenium-webdriver/firefox";

import {
 writeFailures,
 sendKeys,
 extensionDir,
 getNewestFileIn,
 killDriver,
} from "./_common"
import { setupVimrc, resetVimrc } from "./_vimrc";
import * as coverageServer  from "./_coverageserver";


describe("Thunderbird", () => {

        let driver: any = undefined;
        let server: any = coverageServer;
        let background: any = undefined;

        beforeAll(async () => {
                const profile_path = path.join(process.cwd(), "thunderbird_profile");
                fs.rmdirSync(profile_path, { recursive: true });

                const profile_zip = path.join(process.cwd(), "tests", "thunderbird_profile.zip");
                await new Promise(resolve => exec(`unzip '${profile_zip}'`, resolve));

                const coverage_dir = path.join(process.cwd(), ".nyc_output");
                try {
                        fs.rmdirSync(coverage_dir, { recursive: true });
                } catch (e) {}
                fs.mkdirSync(coverage_dir, { recursive: true })

                coverageServer.start(12345, coverage_dir);
                const backgroundPromise = coverageServer.getNextBackgroundConnection();

                setupVimrc();

                const extensionPath = await getNewestFileIn(path.join(extensionDir, "xpi"));

                const options = (new Options()).setProfile(profile_path);

                if (env["HEADLESS"]) {
                        options.headless();
                }

                const paths = process.env.PATH.split(":");
                let thunderbird_bin = "thunderbid";
                for (let p of paths) {
                        p = path.join(p, "thunderbird");
                        if (fs.existsSync(p)) {
                                thunderbird_bin = p;
                                break;
                        }
                }
                options.setBinary(thunderbird_bin);
                options.addExtensions(extensionPath);
                options.setPreference("mail.provider.suppress_dialog_on_startup", true);
                options.setPreference("mail.identity.id1.compose_html", false);


                driver = new webdriver.Builder()
                        .forBrowser("firefox")
                        .setFirefoxOptions(options)
                        .build();
                background = await backgroundPromise;
        }, 120000);

        beforeEach(async () => {
                resetVimrc();
        }, 120000);

        afterAll(async () => {
                await server.pullCoverageData(background);
                await server.shutdown();
                writeFailures();
                await killDriver(server, driver);
        }, 120000);

        function t(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test(s, () => f(s, server, driver), ms);
        }
        function o(s: string, f: (s: string, s2: any, d: any) => Promise<any>, ms?: number) {
                return test.only(s, () => f(s, server, driver), ms);
        }

        t("Empty test always succeeds", () => new Promise(resolve => resolve(expect(true).toBe(true))));
        t("Composing messages works", async (_, server, driver) => {
                const composeConnection = server.getNextComposeConnection();

                // Get existing emails
                let emails;
                do {
                        emails = await server.backgroundEval("browser.messages.query({})");
                } while (emails.messages.length === 0);
                const id = emails.messages[emails.messages.length - 1].id;

                // Reply to last email
                const composeDetails = await server.backgroundEval(`browser.compose.beginReply(${id})`);

                // Await compose window creation
                const composeScript = await composeConnection;

                // Send keystrokes to compose window
                const composeTab = (await server.backgroundEval("browser.tabs.query({})")).find((t: any) => t.type === "messageCompose");
                await driver.sleep(1000);
                await server.backgroundEval(`browser.tabs.sendMessage(${composeTab.id}, { args: ["GiHello!<Esc>"], funcName: ["frame_sendKey"] })`);
                await driver.sleep(1000);

                // Be ready for closure
                coverageServer.pullCoverageData(composeScript);

                // Send email
                await server.backgroundEval(`browser.tabs.sendMessage(${composeTab.id}, { args: [":call firenvim#thunderbird_send()"], funcName: ["frame_sendKey"] })`);
                await driver.sleep(1000);
                await server.backgroundEval(`browser.tabs.sendMessage(${composeTab.id}, { args: ["<CR>"], funcName: ["frame_sendKey"] })`);

                // Find new email
                let newEmails;
                do {
                        newEmails = await server.backgroundEval("browser.messages.query({})");
                } while (emails.messages.length === newEmails.messages.length);
                const lastEmail = newEmails.messages[newEmails.messages.length - 1];
                const fullEmail = await server.backgroundEval(`browser.messages.getFull(${lastEmail.id})`);

                // Make sure sent email contains the lines we're interested in
                const lines = fullEmail.parts[0].body.split("\n").filter((l: string) => l.length > 0);
                expect(lines[0]).toMatch(/^On.*, Firenvim Testsuite wrote:$/);
                expect(lines[lines.length - 1]).toBe("Hello!");
        }, 100000);
})
