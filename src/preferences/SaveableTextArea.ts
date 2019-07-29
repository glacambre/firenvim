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
            this.setState((prevState: any) => ({
                currentContent: list[prevState.configName],
                savedContent: list[prevState.configName],
            }));
        });
        browser.storage.onChanged.addListener((changes: any, areaname: any) => {
            if (changes[this.state.configName]) {
                this.setState((prevState: any) => ({
                    currentContent: changes[prevState.configName].newValue,
                    savedContent: changes[prevState.configName].newValue,
                }));
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
                disabled: this.state.disabled,
                onChange: (e: any) => this.onTextInput(e),
                value: this.state.currentContent,
            }),
            saveButton,
        );
    }
}
