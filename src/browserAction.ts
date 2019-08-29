function displayErrors() {
    function insertError(error: any) {
        console.log(error);
        document.getElementById("errors").innerText = error;
    }
    return browser.runtime.sendMessage({ funcName: ["getError"] })
        .then(insertError)
        .catch(insertError);
}

addEventListener("DOMContentLoaded", () => {
    document.getElementById("reloadSettings").addEventListener("click", () => {
        browser.runtime.sendMessage( { funcName: ["updateSettings"] })
            .then(displayErrors)
            .catch(displayErrors);
    });
    displayErrors();
});
