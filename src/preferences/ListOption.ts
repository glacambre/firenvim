import * as React from "react";
import * as browser from "webextension-polyfill"; // lgtm[js/unused-local-variable]
import { SaveableTextArea } from "./SaveableTextArea";

export class ListOption extends React.Component {

    public render() {
        return React.createElement("div", { className: "listoption-container" },
            React.createElement("h3", {}, "Blacklist"),
            React.createElement("p", {}, `The following text area lets you
                disable Firenvim on a per-URL basis. Each line should
                be a regex that can be accepted by JavaScript's `,
                React.createElement("a", {
                    href: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp",
                }, "RegExp"),
                ` constructor.`),
            React.createElement(SaveableTextArea, {
                configName: "blacklist",
                defaultContent: "example\\.{com,org,net}",
                disabled: false,
            }),
        );
    }
}
