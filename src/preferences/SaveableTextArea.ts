import * as React from "react";
import * as browser from "webextension-polyfill";

export class SaveableTextArea extends React.Component {
    public state: {
        configName: string,
        currentContent: string,
        disabled: boolean,
        savedContent: string,
    };

    constructor(props: any) {
        super(props);
        this.state = {
            configName: props.configName,
            currentContent: props.defaultContent,
            disabled: props.disabled,
            savedContent: props.defaultContent,
        };
        browser.storage.sync.get(this.state.configName).then((list: any) => {
            this.setState({
                currentContent: list[this.state.configName],
                savedContent: list[this.state.configName],
            });
        });
        browser.storage.onChanged.addListener((changes: any, areaname: any) => {
            if (changes[this.state.configName]) {
                this.setState({
                    currentContent: changes[this.state.configName].newValue,
                    savedContent: changes[this.state.configName].newValue,
                });
            }
        });
    }

    public onTextInput(e: React.FormEvent<HTMLElement>) {
        this.setState({
            currentContent: (e.target as HTMLTextAreaElement).value,
        });
    }

    public saveContent() {
        const obj: any = {};
        obj[this.state.configName] = this.state.currentContent;
        browser.storage.sync.set(obj);
    }

    public render() {
        let saveButton;
        if (this.state.savedContent !== this.state.currentContent) {
            saveButton = React.createElement("input", {
                className: "saveButton",
                onClick: (e) => this.saveContent(),
                type: "button",
                value: "Save changes",
            });
        }

        return React.createElement("div", {},
            React.createElement("textarea", {
                disabled: (this.props as any).disabled,
                onInput: (e: any) => this.onTextInput(e),
                value: this.state.currentContent,
            }),
            saveButton,
        );
    }
}
