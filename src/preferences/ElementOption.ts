import * as React from "react";
import * as browser from "webextension-polyfill";
import { SaveableTextArea } from "./SaveableTextArea";

export class ElementOption extends React.Component {

    public render() {
        return React.createElement("div", { className: "elementoption-container" },
            React.createElement("h3", {}, "Elements where Firenvim should be used"),
            React.createElement("p", {}, `Here you can specify what elements you
                want to use Firenvim with. The first string will be used as a
                regex matching a URL. The rest of the line is used as CSS
                selectors that should match all elements you want to use
                Firenvim on. For example, if you want to use Firenvim on github
                but only to write the body of new issues and comments, you could
                have the following rule:`),
            React.createElement("code", {}, `github\\.com #issue_body, #new_comment_field`),
            React.createElement("p", {}, `This will prevent Firenvim from
                embedding itself on any other element found on github.com.
                Note that you can only have a single match per URL. If multiple
                patterns can match the same URL, only the first match found
                will be used.`),
            React.createElement(SaveableTextArea, {
                configName: "elements",
                defaultContent: ".* textarea",
                disabled: false,
            }),
        );
    }
}
