import hashlib
from flask_restx import Resource
from extensions.ext_restx import api
from flask import request
from extensions.ext_duck import db_sound


@api.route("/sounds")
class SoundList(Resource):

    def post(self):
        payload = request.json
        limit = payload.get("limit", 50)
        offset = payload.get("offset", 0)
        path = payload.get("path", "").strip("/")
        tags = payload.get("tags", [])
        oneshot = payload.get("oneshot", "")
        key=payload.get("key", "")
        op = payload.get("op", "AND")
        rand = payload.get("rand", False)
        if path:
            uid = hashlib.md5(path.encode("utf-8")).hexdigest()
            return db_sound.get_sound_by_uid(uid)
        else:
            if op == "AND":
                return db_sound.get_sound_by_and_tags(tags, oneshot, key,  limit, offset, rand)
            else:
                return db_sound.get_sound_by_or_tags(tags, oneshot, key, limit, offset, rand)
