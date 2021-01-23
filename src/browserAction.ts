
function displayMessages(func: "getError" | "getWarning", id: "errors" | "warnings") {
    function insertMessage(msg: any) {
        document.getElementById(id).innerText = msg;
    }
    return browser.runtime.sendMessage({ funcName: [func] })
        .then(insertMessage)
        .catch(insertMessage);
}

function displayErrorsAndWarnings() {
    return Promise.all([displayMessages("getWarning", "warnings"), displayMessages("getError", "errors")]);
}

async function updateDisableButton() {
    const tabId = (await browser.runtime.sendMessage({
        args: {
            args: [{ active: true, currentWindow: true }],
            funcName: [ "browser", "tabs", "query" ],
        },
        funcName: ["exec"],
    }))[0].id;
    const disabled = (await browser.runtime.sendMessage({
        args: [tabId, "disabled"],
        funcName: ["getTabValueFor"],
    }));
    const button = document.getElementById("disableFirenvim");
    if (disabled === true) {
        button.innerText = "Enable in this tab";
    } else {
        button.innerText = "Disable in this tab";
    }
}

addEventListener("DOMContentLoaded", () => {
    document.getElementById("reloadSettings").addEventListener("click", () => {
        browser.runtime.sendMessage( { funcName: ["updateSettings"] })
            .then(displayErrorsAndWarnings)
            .catch(displayErrorsAndWarnings);
    });
    document.getElementById("disableFirenvim").addEventListener("click", () => {
        browser.runtime.sendMessage( { funcName: ["toggleDisabled"] })
            .then(updateDisableButton);
    });
    displayErrorsAndWarnings();
    updateDisableButton();
});
