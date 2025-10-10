import hashlib
import mimetypes
from flask_restx import Resource
from flask import request, Response
from extensions.ext_opendal import storage
from extensions.ext_restx import api
from extensions.ext_duck import db_sound


@api.route("/file")
class FilePreview(Resource):
    
    def get(self):
        path = request.args.get("path", "").strip("/")
        if path:
            uid = hashlib.md5(path.encode("utf-8")).hexdigest()
            info = db_sound.get_sound_by_uid(uid)
            if info:
                info = info[0]
                gen = storage.load_stream(path)
                mime_type = mimetypes.guess_type(f"file{info['ext']}")[0]
                return Response(gen, mimetype=mime_type)
        return {}
