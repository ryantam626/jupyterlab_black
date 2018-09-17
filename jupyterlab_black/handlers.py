import json
import subprocess
import tempfile

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

        worker_temp_file = tempfile.NamedTemporaryFile()
        format_temp_file = tempfile.NamedTemporaryFile()

        worker_temp_file.file.write(
                """
from black import format_str
with open('{format_temp}', 'r') as file_:
    unformatted = file_.read()
formatted = format_str(unformatted, line_length={line_length})
with open('{format_temp}', 'w') as file_:
    file_.write(formatted)
                """.format(line_length=line_length, format_temp=format_temp_file.name).encode()
            )
        worker_temp_file.file.flush()

        format_temp_file.file.write(unformatted.encode())
        format_temp_file.file.flush()

        retcode = subprocess.call([python, worker_temp_file.name])
        if retcode != 0:
            self.set_status(500, "Blew up in subprocess..")
            self.finish()

        format_temp_file.file.seek(0)
        formatted = format_temp_file.file.read().decode()

        worker_temp_file.close()
        format_temp_file.close()

        self.finish(json.dumps(formatted))
