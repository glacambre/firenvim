import * as React from "react";
import { SaveableTextArea } from "./SaveableTextArea";

export class ListInput extends React.Component {
    public state: {
        checked: boolean,
        kind: "whitelist" | "blacklist",
    };
    private messages = {
        "Enable Firenvim": {
            blacklist: "Enable Firenvim everywhere, except for these pages:",
            whitelist: "Enable Firenvim only on these pages:",
        },
    };

    constructor(props: any) {
        super(props);
        this.state = {
            checked: false,
            kind: props.kind,
        };
        browser.storage.sync.get("selected").then(({ selected }: { selected: string }) => {
            this.setState({ checked: selected === this.state.kind });
        });
        browser.storage.onChanged.addListener((changes, areaname) => {
            if (changes.selected) {
                this.setState({ checked: changes.selected.newValue === this.state.kind });
            }
        });

    }

    public onRadioChange(e: React.FormEvent<HTMLInputElement>) {
        const checked = (e.target as HTMLInputElement).checked;
        this.setState({ checked });
        if (checked) {
            browser.storage.sync.set({ selected: this.state.kind });
        }
    }

    public render() {
        const id = this.state.kind + "checkbox";
        return React.createElement("div", { id: this.state.kind, className: "listoption" },
            React.createElement("input", {
                checked: this.state.checked,
                id,
                // name: "listtype",
                onChange: e => this.onRadioChange(e),
                type: "radio",
                value: this.state.kind,
            }),
            React.createElement("label", { htmlFor: id },
                this.messages["Enable Firenvim"][this.state.kind]),
            React.createElement(SaveableTextArea, {
                configName: this.state.kind,
                defaultContent: "example\\.{org,com}\nexample.net",
                disabled: !this.state.checked,
            }),
        );
    }
}
