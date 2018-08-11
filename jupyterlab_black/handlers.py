import json
import subprocess

from notebook.utils import url_path_join
from notebook.base.handlers import APIHandler


def setup_handlers(web_app):
    host_pattern = '.*$'
    web_app.add_handlers(
        host_pattern,
        [(url_path_join(web_app.settings["base_url"], "/jupyterlab_black/format"), JupyterlabBlackAPIHandler)]
    )


class JupyterlabBlackAPIHandler(APIHandler):

    @staticmethod
    def run_command_sync(cmd):
        try:
            process = subprocess.run(cmd, stdout=subprocess.PIPE)
            code = process.returncode
            out = process.stdout.decode("utf-8")
        except subprocess.CalledProcessError as err:
            code = 999
            out = "Error in subprocess!! {}".format(err)
        return code, out


    def post(self):
        data = json.loads(self.request.body.decode("utf-8"))
        python = data["python"]
        line_length = data["lineLength"]
        unformatted = data["code"]

        with open("/tmp/jupyrerlab_black_worker.py", "w") as file_:
            file_.write(
                """
from black import format_str
with open('/tmp/jupyterlab_black_working.py', 'r') as file_:
    unformatted = file_.read()
formatted = format_str(unformatted, line_length={line_length})
with open('/tmp/jupyterlab_black_working.py', 'w') as file_:
    file_.write(formatted)
                """.format(line_length=line_length)
            )

        with open("/tmp/jupyterlab_black_working.py", "w") as file_:
            file_.write(unformatted)

        retcode = subprocess.call([python, "/tmp/jupyrerlab_black_worker.py"])

        if retcode != 0:
            self.set_status(500, "Blew up in subprocess..")
            self.finish()

        with open("/tmp/jupyterlab_black_working.py", "r") as file_:
            formatted = file_.read()

        self.finish(json.dumps(formatted))
