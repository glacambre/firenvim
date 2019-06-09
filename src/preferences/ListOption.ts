import * as React from "react";
import { ListInput } from "./ListInput";

type ListType = "blacklist" | "whitelist";

export class ListOption extends React.Component {

    public render() {
        return React.createElement("div", { className: "listoption-container" },
            React.createElement("h3", {}, "Pages where Firenvim should be used"),
            ["blacklist", "whitelist"].map(kind =>
                React.createElement(ListInput, {
                    key: kind,
                    kind,
                }, null),
            ),
        );
    }
}
