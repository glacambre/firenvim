import * as React from "react";

export class ListInput extends React.Component {
    public state: {
        checked: boolean,
        kind: "whitelist" | "blacklist",
        savedRules: string,
        stagedRules: string,
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
            savedRules: "example\\.{org,com}\nexample.net",
            stagedRules: "example\\.{org,com}\nexample.net",
        };
        browser.storage.sync.get("selected").then(({ selected }: { selected: string }) => {
            this.setState({ checked: selected === this.state.kind });
        });
        browser.storage.sync.get(this.state.kind).then((list: any) => {
            this.setState({ savedRules: list[this.state.kind], stagedRules: list[this.state.kind] });
        });
        browser.storage.onChanged.addListener((changes, areaname) => {
            if (changes.selected) {
                this.setState({ checked: changes.selected.newValue === this.state.kind });
            }
            if (changes[this.state.kind]) {
                this.setState({
                    savedRules: changes[this.state.kind].newValue,
                    stagedRules: changes[this.state.kind].newValue,
                });
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

    public onTextInput(e: React.FormEvent<HTMLElement>) {
        this.setState({
            stagedRules: (e.target as HTMLTextAreaElement).value,
        });
    }

    public saveStagedRules() {
        const obj: any = {};
        obj[this.state.kind] = this.state.stagedRules;
        browser.storage.sync.set(obj);
    }

    public render() {
        let saveButton;
        if (this.state.savedRules !== this.state.stagedRules) {
            saveButton = React.createElement("input", {
                className: "saveButton",
                onClick: (e) => this.saveStagedRules(),
                type: "button",
                value: "Save changes",
            });
        }

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
            React.createElement("textarea", {
                disabled: !this.state.checked,
                onInput: e => this.onTextInput(e),
                value: this.state.stagedRules,
            }),
            saveButton,
        );
    }
}
