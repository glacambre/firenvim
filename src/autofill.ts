
export async function autofill() {
    const platInfoPromise = browser.runtime.sendMessage({
        args: {
            args: [],
            funcName: ["browser", "runtime", "getPlatformInfo"],
        },
        funcName: ["exec"],
    });
    const manifestPromise = browser.runtime.sendMessage({
        args: {
            args: [],
            funcName: ["browser", "runtime", "getManifest"],
        },
        funcName: ["exec"],
    });
    const nvimPluginPromise = browser.runtime.sendMessage({
        args: {},
        funcName: ["getNvimPluginVersion"],
    });
    const issueTemplatePromise = fetch(browser.runtime.getURL("ISSUE_TEMPLATE.md")).then(p => p.text());
    const browserString = navigator.userAgent.match(/(firefox|chrom)[^ ]+/gi);
    let name = "";
    let version = "";
    if (browserString) {
        [ name, version ] = browserString[0].split("/");
    }
    const vendor = navigator.vendor || "";
    const textarea = document.getElementById("issue_body") as any;
    const [
        platInfo,
        manifest,
        nvimPluginVersion,
        issueTemplate,
    ] = await Promise.all([platInfoPromise, manifestPromise, nvimPluginPromise, issueTemplatePromise]);
    if (!textarea || textarea.value !== issueTemplate) {
        return;
    }
    textarea.value = issueTemplate
        .replace("OS Version:", `OS Version: ${platInfo.os} ${platInfo.arch}`)
        .replace("Browser Version:", `Browser Version: ${vendor} ${name} ${version}`)
        .replace("Browser Addon Version:", `Browser Addon Version: ${manifest.version}`)
        .replace("Neovim Plugin Version:", `Neovim Plugin Version: ${nvimPluginVersion}`);
}
