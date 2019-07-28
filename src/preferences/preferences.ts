import * as React from "react";
import * as ReactDOM from "react-dom";
import * as browser from "webextension-polyfill";
import { ElementOption } from "./ElementOption";
import { ListOption } from "./ListOption";

class Page extends React.Component {
    constructor(props: any) {
        super(props);
    }
    public render() {
        return React.createElement("div", { id: "main" },
            React.createElement(ListOption),
            React.createElement(ElementOption),
        );
    }
}

document.addEventListener("DOMContentLoaded",
    () => ReactDOM.render(React.createElement(Page), document.getElementById("root")),
);
