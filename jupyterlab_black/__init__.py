from jupyterlab_black.handlers import setup_handlers


def _jupyter_server_extension_paths():
    return [{'module': 'jupyterlab_black'}]


def load_jupyter_server_extension(notebook_app):
    setup_handlers(notebook_app.web_app)
