import * as browser from "webextension-polyfill";

function displayErrors() {
    function insertError(error: any) {
        console.log(error);
        document.getElementById("errors").innerText = error;
    }
    return browser.runtime.sendMessage({ funcName: ["getError"] })
        .then(insertError)
        .catch(insertError);
}

async function updateDisableButton() {
    const tabId = (await browser.runtime.sendMessage({
        args: {
            args: [{ active: true }],
            funcName: [ "browser", "tabs", "query" ],
        },
        funcName: ["exec"],
    }))[0].id;
    const disabled = (await browser.runtime.sendMessage({
        args: [tabId, "disabled"],
        funcName: ["getTabValueFor"],
    }));
    const button = document.getElementById("disableFirenvim");
    if (disabled === "true") {
        button.innerText = "Enable in this tab";
    } else {
        button.innerText = "Disable in this tab";
    }
}

addEventListener("DOMContentLoaded", () => {
    document.getElementById("reloadSettings").addEventListener("click", () => {
        browser.runtime.sendMessage( { funcName: ["updateSettings"] })
            .then(displayErrors)
            .catch(displayErrors);
    });
    document.getElementById("disableFirenvim").addEventListener("click", () => {
        browser.runtime.sendMessage( { funcName: ["toggleDisabled"] })
            .then(updateDisableButton);
    });
    displayErrors();
    updateDisableButton();
});
