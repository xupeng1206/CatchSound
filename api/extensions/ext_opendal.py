import logging
from collections.abc import Generator
from pathlib import Path
from opendal import Operator
from config import OPENDAL_FS_ROOT

logger = logging.getLogger(__name__)


class OpenDALStorage():
    def init_app(self, app):
        self.op = Operator(scheme="fs", root=OPENDAL_FS_ROOT)

    def save(self, filename: str, data: bytes):
        self.op.write(path=filename, bs=data)
        logger.debug("file %s saved", filename)

    def load_once(self, filename: str) -> bytes:
        if not self.exists(filename):
            raise FileNotFoundError("File not found")

        content: bytes = self.op.read(path=filename)
        logger.debug("file %s loaded", filename)
        return content

    def load_stream(self, filename: str) -> Generator:
        if not self.exists(filename):
            raise FileNotFoundError("File not found")

        batch_size = 4096
        with self.op.open(
            path=filename,
            mode="rb",
            chunck=batch_size,
        ) as file:
            while chunk := file.read(batch_size):
                yield chunk
        logger.debug("file %s loaded as stream", filename)

    def download(self, filename: str, target_filepath: str):
        if not self.exists(filename):
            raise FileNotFoundError("File not found")

        Path(target_filepath).write_bytes(self.op.read(path=filename))
        logger.debug("file %s downloaded to %s", filename, target_filepath)

    def exists(self, filename: str) -> bool:
        return self.op.exists(path=filename)

    def delete(self, filename: str):
        if self.exists(filename):
            self.op.delete(path=filename)
            logger.debug("file %s deleted", filename)
            return
        logger.debug("file %s not found, skip delete", filename)

    def scan(self, path: str, files: bool = True, directories: bool = False) -> list[str]:
        if not self.exists(path):
            raise FileNotFoundError("Path not found")

        all_files = self.op.list(path=path)
        if files and directories:
            logger.debug("files and directories on %s scanned", path)
            return [f.path for f in all_files]
        if files:
            logger.debug("files on %s scanned", path)
            return [f.path for f in all_files if not f.path.endswith("/")]
        elif directories:
            logger.debug("directories on %s scanned", path)
            return [f.path for f in all_files if f.path.endswith("/")]
        else:
            raise ValueError("At least one of files or directories must be True")

storage = OpenDALStorage()
