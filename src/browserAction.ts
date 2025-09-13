
import { MessageType } from "./MessageTypes";

function displayMessages(messageType: MessageType.GET_ERROR | MessageType.GET_WARNING, id: "errors" | "warnings") {
    function insertMessage(msg: any) {
        document.getElementById(id).innerText = msg;
    }
    return browser.runtime.sendMessage({ type: messageType })
        .then(insertMessage)
        .catch(insertMessage);
}

function displayErrorsAndWarnings() {
    return Promise.all([displayMessages(MessageType.GET_WARNING, "warnings"), displayMessages(MessageType.GET_ERROR, "errors")]);
}

async function updateDisableButton() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;
    const disabled = await browser.runtime.sendMessage({
        type: MessageType.GET_TAB_VALUE_FOR,
        args: [tabId, "disabled"],
    });
    const button = document.getElementById("disableFirenvim");
    if (disabled === true) {
        button.innerText = "Enable in this tab";
    } else {
        button.innerText = "Disable in this tab";
    }
}

addEventListener("DOMContentLoaded", () => {
    document.getElementById("reloadSettings").addEventListener("click", () => {
        browser.runtime.sendMessage({ type: MessageType.UPDATE_SETTINGS })
            .then(displayErrorsAndWarnings)
            .catch(displayErrorsAndWarnings);
    });
    document.getElementById("disableFirenvim").addEventListener("click", () => {
        browser.runtime.sendMessage({ type: MessageType.TOGGLE_DISABLED })
            .then(updateDisableButton);
    });
    document.getElementById("troubleshooting").addEventListener("click", () => {
        browser.runtime.sendMessage({ type: MessageType.OPEN_TROUBLESHOOTING_GUIDE });
    })
    displayErrorsAndWarnings();
    updateDisableButton();
});
