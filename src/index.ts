import {
    ICommandPalette,
} from "@jupyterlab/apputils";

import {
    JupyterLab, JupyterLabPlugin,
} from "@jupyterlab/application";

import {
    INotebookTracker,
} from "@jupyterlab/notebook";

import {
    CodeCell,
} from "@jupyterlab/cells";

import {
    ServerConnection,
} from "@jupyterlab/services";

import {
    ISettingRegistry, URLExt,
} from "@jupyterlab/coreutils";

import "../style/index.css";

function blackRequest(
    path: string,
    method: string,
    body: any,
    settings: ServerConnection.ISettings,
): Promise<any> {
    const fullUrl = URLExt.join(settings.baseUrl, "jupyterlab_black", path);

    return ServerConnection.makeRequest(fullUrl, { body, method }, settings).then((response) => {
        if (response.status !== 200) {
            return response.text().then((data) => {
                throw new ServerConnection.ResponseError(response, data);
            });
        }
        return response.text();
    });
}

class JupyterLabBlackFormatter {
    private app: JupyterLab;
    private tracker: INotebookTracker;
    private palette: ICommandPalette;
    private settingRegistry: ISettingRegistry;

    private working = false;
    private lineLength: number;
    private python: string;

    constructor(
        app: JupyterLab, tracker: INotebookTracker,
        palette: ICommandPalette, settingRegistry: ISettingRegistry,
    ) {
        this.app = app;
        this.tracker = tracker;
        this.palette = palette;
        this.settingRegistry = settingRegistry;
        this.setupButton();
        this.setupSettings();
    }

    private setupSettings() {
        const self = this;
        Promise.all([this.settingRegistry.load("@ryantam626/jupyterlab_black:settings")]).then(
            ([settings]) => {
                function onSettingsUpdated(jsettings: ISettingRegistry.ISettings) {
                    self.lineLength = jsettings.get("lineLength").composite as number;
                    self.python = jsettings.get("blackPythonBin").composite as string;
                }
                settings.changed.connect(onSettingsUpdated);
                onSettingsUpdated(settings);
            },
            // tslint:disable-next-line:no-console
        ).catch((reason: Error) => console.error(reason.message));
    }

    private maybeFormatCodecell() {
        // TODO: Check current kernel is of Python2/3
        const self = this;
        if (this.working) {
            // tslint:disable-next-line:no-console
            console.log("Already working on something!! CHILL.");
        } else {
            if (this.tracker.activeCell instanceof CodeCell) {
                this.working = true;
                blackRequest("format", "POST", JSON.stringify(
                    {
                        code: self.tracker.activeCell.model.value.text,
                        lineLength: self.lineLength,
                        python: self.python,
                    },
                ),
                ServerConnection.defaultSettings).then(
                    (data) => {
                        const formattedCode = JSON.parse(data);
                        // NOTE: We don't want a newline at the end of the code cell!
                        self.tracker.activeCell.model.value.text = formattedCode.substr(0, formattedCode.length - 1);
                        self.working = false;
                    },
                ).catch(
                    () => {
                        self.working = false;
                        // tslint:disable-next-line:no-console
                        console.error("Something went wrong, check your python interpreter settings is correct maybe?");
                    },
                );
            } else {
                // tslint:disable-next-line:no-console
                console.log("This doesn't seem like a code cell...");
            }
        }
    }

    private setupButton() {
        const command = "jupyterlab_black:format";
        this.app.commands.addCommand(command, {
            execute: () => {
                this.maybeFormatCodecell();
            },
            label: "Apply Black Formatter",
        });
        this.palette.addItem({ command, category: "JupyterLab Black" });
    }

}

/**
 * Initialization data for the jupyterlab_black extension.
 */
const extension: JupyterLabPlugin<void> = {
    activate: (
        app: JupyterLab, palette: ICommandPalette,
        tracker: INotebookTracker, settingRegistry: ISettingRegistry,
    ) => {
        // tslint:disable-next-line:no-unused-expression
        new JupyterLabBlackFormatter(app, tracker, palette, settingRegistry);
    },
    autoStart: true,
    id: "jupyterlab_black",
    requires: [ICommandPalette, INotebookTracker, ISettingRegistry],
};

export default extension;
