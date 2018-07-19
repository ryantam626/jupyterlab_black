import {
    ICommandPalette
} from '@jupyterlab/apputils';

import {
    JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
    INotebookTracker
} from '@jupyterlab/notebook';

import {
    Terminal
} from '@jupyterlab/terminal';

import {
    CodeCell
} from '@jupyterlab/cells';

import {
    ISettingRegistry,
} from '@jupyterlab/coreutils';

import '../style/index.css';

// NOTE: EOL for when we write to tmp, there probably
//       isn't a chance of user's input to colide with this...
const EOL = 'I97Qo3mjGJLySbuljz1Fzvh1ulPWBQdkG0QZ';
// NOTE: Listening to a terminal and determining which message is meant for
//       us is hard, let's make this less hard by prepending some string
const STDOUT_MARKER = 'Cl3PsCL5Ionv1d9tQMvNXRtz5aXUHj2VMk3mnn7Sg179';


class JupyterLabBlackFormatter {
    _app: JupyterLab;
    _tracker: INotebookTracker;
    _palette: ICommandPalette;
    _term: Terminal;
    _settingRegistry: ISettingRegistry;

    _loaded = false;
    _working = false;
    _success = false;
    _lineLength: number;
    _python: string;

    constructor(app: JupyterLab, tracker: INotebookTracker, palette: ICommandPalette, settingRegistry: ISettingRegistry){
        this._app = app;
        this._tracker = tracker;
        this._palette = palette;
        this._settingRegistry = settingRegistry;
        this.setupButton();
        this.setupTerminalSession();
        this.setupSettings();
    }

    setupSettings(){
        let self = this;
        Promise.all([this._settingRegistry.load('@ryantam626/jupyterlab_black:settings')]).then(
            ([settings]) => {
                function onSettingsUpdated(settings: ISettingRegistry.ISettings){
                    self._lineLength = settings.get('lineLength').composite as number;
                    self._python = settings.get('blackPythonBin').composite as string;
                }
                settings.changed.connect(onSettingsUpdated);
                onSettingsUpdated(settings);
            }
        ).catch((reason: Error) => console.error(reason.message));
    }

    // TODO: Attempt to reuse a terminal somewhere..

    async setupTerminalSession(){
        // Abort if somehow no terminals available.
        if (!this._app.serviceManager.terminals.isAvailable()) {
            console.log('Disabling jupyterlab_black plugin because lack of terminal access.');
            this._loaded = false;
            return;
        }

        this._term = new Terminal();

        try {
            this._term.session = await this._app.serviceManager.terminals.startNew();
            // NOTE: unset HISTFILE so user's shell history is no longer as polluted
            //       when we dump codecell content though terminal.
            this._term.session.send({type: 'stdin', content: ['unset HISTFILE\r']})
            this._loaded = true;
            console.log('Terminal session started.', this._term.session.name);
        } catch(e) {
            this._term.dispose();
            this._term = undefined;
            this._loaded = false;
        }
    }

    maybeFormatCodecell(){
        // TODO: Check current kernel is of Python2/3
        if (!this._loaded) {
            console.log('Terminal session is NOT started. Retry??');
        } else if (this._working) {
            console.log('Already working on something!! CHILL.');
        } else {
            if (this._tracker.activeCell instanceof CodeCell) {
                this._working = true;
                this._success = false;
                this.dump_to_tmp(this._tracker.activeCell.model.value.text);
                if (this.format_tmp(this._tracker.activeCell.model.id)) {
                    this.retrieve_and_set_formatted_code(this._tracker.activeCell);
                }
            } else {
                console.log("This doesn't seem like a code cell...");
            }
        }
    }

    dump_to_tmp(content: string){
        this._term.session.send({
            type: 'stdin',
            content: [
`cat > /tmp/jupyterlab_black_working.py <<${EOL}
${content}
${EOL}\r`
            ]
        });
    }

    format_tmp(codeCellIdent: string){
        if (this._python === undefined || this._python === null) {
            console.error('It appears the python interpreter is not set!');
            this._working = false;
            return false;
        }
        this._term.session.send({
            type: 'stdin',
            content: [
`${this._python} - <<${EOL}
from black import format_str
with open('/tmp/jupyterlab_black_working.py', 'r') as file_:
    unformatted = file_.read()
formatted = format_str(unformatted, line_length=${this._lineLength})
with open('/tmp/jupyterlab_black_working.py', 'w') as file_:
    file_.write("${STDOUT_MARKER}${codeCellIdent}" + formatted)
${EOL}\r`
            ]
        });
        return true;
    }

    retrieve_and_set_formatted_code(activeCell: CodeCell){
        let self = this;

        function cleanTerminalOutput(termOutput: string): string{
            let cleanedOutput = termOutput.replace(STDOUT_MARKER + activeCell.model.id, '');
            // Convert line endings if necessary
            // TOOD: Find out what happens with Mac/Windows...
            cleanedOutput = cleanedOutput.replace(/\r\n|\r/g, '\n');
            // NOTE: We don't want a newline at the end of the code cell!
            cleanedOutput = cleanedOutput.substr(0, cleanedOutput.length - 1);
            return cleanedOutput;
        }

        function onTerminalMessage(sender: any, rawMessage: any): void{
            let message: string = rawMessage.content[0];
            if (message.indexOf(STDOUT_MARKER + activeCell.model.id) > -1){
                activeCell.model.value.text = cleanTerminalOutput(message);
                self._success = true;
                self._term.session.messageReceived.disconnect(onTerminalMessage, self);
            }
        }
        this._term.session.messageReceived.connect(onTerminalMessage, this);
        // FIXME: This probably doesn't work for Windows?
        this._term.session.send({type: 'stdin', content: ['cat /tmp/jupyterlab_black_working.py\r']})

        let check_success_promise = new Promise((resolve, reject) => {
            (function check_success(){
                setTimeout(function(){
                    if (self._success){
                        resolve();
                    } else {
                        check_success();
                    }
                }, 50);
            })();
        });
        let check_failure_promise = new Promise(function(resolve, reject) {
            setTimeout(reject, 1000);
        });

        Promise.race([check_success_promise, check_failure_promise]).then(response => {
            this._working = false;
        }).catch(response => {
            this._term.session.messageReceived.connect(onTerminalMessage, this);
            this._working = false;
            console.error('Something went wrong, check your python interpreter settings is correct maybe?')
        });
    }

    setupButton(){
        const command = "jupyterlab_black:format";
        this._app.commands.addCommand(command,{
            label: "Apply Black Formatter",
            execute: () => {
                this.maybeFormatCodecell();
            }
        });
        this._palette.addItem( {command, category: "JupyterLab Black"} );
    }

}

/**
 * Initialization data for the jupyterlab_black extension.
 */
const extension: JupyterLabPlugin<void> = {
  id: 'jupyterlab_black',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, ISettingRegistry],
  activate: (app: JupyterLab, palette: ICommandPalette, tracker: INotebookTracker, settingRegistry: ISettingRegistry) => {
    new JupyterLabBlackFormatter(app, tracker, palette, settingRegistry);
  }
};

export default extension;
