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
    Terminal,
} from "@jupyterlab/terminal";

import {
    CodeCell,
} from "@jupyterlab/cells";

import {
    ISettingRegistry,
} from "@jupyterlab/coreutils";

import "../style/index.css";

// NOTE: EOL for when we write to tmp, there probably
//       isn't a chance of user's input to colide with this...
const EOL = "I97Qo3mjGJLySbuljz1Fzvh1ulPWBQdkG0QZ";
// NOTE: Listening to a terminal and determining which message is meant for
//       us is hard, let's make this less hard by prepending some string
const STDOUT_MARKER = "Cl3PsCL5Ionv1d9tQMvNXRtz5aXUHj2VMk3mnn7Sg179";

class JupyterLabBlackFormatter {
    private app: JupyterLab;
    private tracker: INotebookTracker;
    private palette: ICommandPalette;
    private term: Terminal;
    private settingRegistry: ISettingRegistry;

    private loaded = false;
    private working = false;
    private success = false;
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
        this.setupTerminalSession();
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

    // TODO: Attempt to reuse a terminal somewhere..

    private async setupTerminalSession() {
        // Abort if somehow no terminals available.
        if (!this.app.serviceManager.terminals.isAvailable()) {
            // tslint:disable-next-line:no-console
            console.log("Disabling jupyterlab_black plugin because lack of terminal access.");
            this.loaded = false;
            return;
        }

        this.term = new Terminal();

        try {
            this.term.session = await this.app.serviceManager.terminals.startNew();
            // NOTE: unset HISTFILE so user's shell history is no longer as polluted
            //       when we dump codecell content though terminal.
            this.term.session.send({type: "stdin", content: ["unset HISTFILE\r"]});
            this.loaded = true;
            // tslint:disable-next-line:no-console
            console.log("Terminal session started.", this.term.session.name);
        } catch (e) {
            this.term.dispose();
            this.term = undefined;
            this.loaded = false;
        }
    }

    private maybeFormatCodecell() {
        // TODO: Check current kernel is of Python2/3
        if (!this.loaded) {
            // tslint:disable-next-line:no-console
            console.log("Terminal session is NOT started. Retry??");
        } else if (this.working) {
            // tslint:disable-next-line:no-console
            console.log("Already working on something!! CHILL.");
        } else {
            if (this.tracker.activeCell instanceof CodeCell) {
                this.working = true;
                this.success = false;
                this.dump_to_tmp(this.tracker.activeCell.model.value.text);
                if (this.format_tmp(this.tracker.activeCell.model.id)) {
                    this.retrieve_and_set_formatted_code(this.tracker.activeCell);
                }
            } else {
                // tslint:disable-next-line:no-console
                console.log("This doesn't seem like a code cell...");
            }
        }
    }

    private dump_to_tmp(content: string) {
        this.term.session.send({
            content: [
`cat > /tmp/jupyterlab_black_working.py <<${EOL}
${content}
${EOL}\r`,
            ],
            type: "stdin",
        });
    }

    private format_tmp(codeCellIdent: string) {
        if (this.python === undefined || this.python === null) {
            // tslint:disable-next-line:no-console
            console.error("It appears the python interpreter is not set!");
            this.working = false;
            return false;
        }
        this.term.session.send({
            content: [
`${this.python} - <<${EOL}
from black import format_str
with open('/tmp/jupyterlab_black_working.py', 'r') as file_:
    unformatted = file_.read()
formatted = format_str(unformatted, line_length=${this.lineLength})
with open('/tmp/jupyterlab_black_working.py', 'w') as file_:
    file_.write("${STDOUT_MARKER}" + "${codeCellIdent}" + formatted)
${EOL}\r`,
            ],
            type: "stdin",

        });
        return true;
    }

    private retrieve_and_set_formatted_code(activeCell: CodeCell) {
        const self = this;

        function cleanTerminalOutput(termOutput: string): string {
            let cleanedOutput = termOutput.replace(STDOUT_MARKER + activeCell.model.id, "");
            // Convert line endings if necessary
            // TOOD: Find out what happens with Mac/Windows...
            cleanedOutput = cleanedOutput.replace(/\r\n|\r/g, "\n");
            // NOTE: We don't want a newline at the end of the code cell!
            cleanedOutput = cleanedOutput.substr(0, cleanedOutput.length - 1);
            return cleanedOutput;
        }

        function onTerminalMessage(sender: any, rawMessage: any): void {
            const message: string = rawMessage.content[0];
            if (message.indexOf(STDOUT_MARKER + activeCell.model.id) > -1) {
                activeCell.model.value.text = cleanTerminalOutput(message);
                self.success = true;
                self.term.session.messageReceived.disconnect(onTerminalMessage, self);
            }
        }
        this.term.session.messageReceived.connect(onTerminalMessage, this);
        // FIXME: This probably doesn't work for Windows?
        this.term.session.send({type: "stdin", content: ["cat /tmp/jupyterlab_black_working.py\r"]});

        const checkSuccessPromise = new Promise((resolve, reject) => {
            (function check_success() {
                setTimeout(() =>  {
                    if (self.success) {
                        resolve();
                    } else {
                        check_success();
                    }
                }, 50);
            })();
        });
        const checkFailurePromise = new Promise((resolve, reject) => {
            setTimeout(reject, 1000);
        });

        Promise.race([checkSuccessPromise, checkFailurePromise]).then((response) => {
            this.working = false;
        }).catch((response) => {
            this.term.session.messageReceived.connect(onTerminalMessage, this);
            this.working = false;
            // tslint:disable-next-line:no-console
            console.error("Something went wrong, check your python interpreter settings is correct maybe?");
        });
    }

    private setupButton() {
        const command = "jupyterlab_black:format";
        this.app.commands.addCommand(command, {
            execute: () => {
                this.maybeFormatCodecell();
            },
            label: "Apply Black Formatter",
        });
        this.palette.addItem( {command, category: "JupyterLab Black"} );
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
