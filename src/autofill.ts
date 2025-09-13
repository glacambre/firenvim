
import { MessageType } from "./MessageTypes";

export async function autofill() {
    const textarea = document.getElementById("issue_body") as any;
    if (!textarea) {
        return;
    }
    const platInfoPromise = browser.runtime.sendMessage({
        type: MessageType.MESSAGE_PAGE,
        args: [{
            args: [],
            funcName: ["browser", "runtime", "getPlatformInfo"],
        }]
    });
    const manifestPromise = browser.runtime.sendMessage({
        type: MessageType.MESSAGE_PAGE,
        args: [{
            args: [],
            funcName: ["browser", "runtime", "getManifest"],
        }]
    });
    const nvimPluginPromise = browser.runtime.sendMessage({
        type: MessageType.GET_NVIM_PLUGIN_VERSION,
        args: []
    });
    const issueTemplatePromise = fetch(browser.runtime.getURL("ISSUE_TEMPLATE.md")).then(p => p.text());
    const browserString = navigator.userAgent.match(/(firefox|chrom)[^ ]+/gi);
    let name;
    let version;
    // Can't be tested, as coverage is only recorded on firefox
    /* istanbul ignore else */
    if (browserString) {
        [ name, version ] = browserString[0].split("/");
    } else {
        name = "unknown";
        version = "unknown";
    }
    const vendor = navigator.vendor || "";
    const [
        platInfo,
        manifest,
        nvimPluginVersion,
        issueTemplate,
    ] = await Promise.all([platInfoPromise, manifestPromise, nvimPluginPromise, issueTemplatePromise]);
    // Can't happen, but doesn't cost much to handle!
    /* istanbul ignore next */
    if (textarea.value.replace(/\r/g, "") !== issueTemplate.replace(/\r/g, "")) {
        return;
    }
    textarea.value = issueTemplate
        .replace("OS Version:", `OS Version: ${platInfo.os} ${platInfo.arch}`)
        .replace("Browser Version:", `Browser Version: ${vendor} ${name} ${version}`)
        .replace("Browser Addon Version:", `Browser Addon Version: ${manifest.version}`)
        .replace("Neovim Plugin Version:", `Neovim Plugin Version: ${nvimPluginVersion}`);
}
