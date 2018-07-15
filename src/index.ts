import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import '../style/index.css';


/**
 * Initialization data for the jupyterlab_black extension.
 */
const extension: JupyterLabPlugin<void> = {
  id: 'jupyterlab_black',
  autoStart: true,
  activate: (app: JupyterLab) => {
    console.log('JupyterLab extension jupyterlab_black is activated!');
  }
};

export default extension;
