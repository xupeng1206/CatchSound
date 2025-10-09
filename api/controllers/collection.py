import hashlib
from flask_restx import Resource
from extensions.ext_restx import api
from flask import request
from extensions.ext_db_sound import db_sound
from extensions.ext_db_collection import db_collection


@api.route("/collection")
class CollectionSoundList(Resource):

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
            return db_collection.get_sound_by_uid(uid)
        else:
            if op == "AND":
                return db_collection.get_sound_by_and_tags(tags, oneshot, key,  limit, offset, rand)
            else:
                return db_collection.get_sound_by_or_tags(tags, oneshot, key, limit, offset, rand)


@api.route("/collection/add")
class CollectionAdd(Resource):
    def post(self):
        path = request.json.get('path', "").strip("/")
        uid = hashlib.md5(path.encode("utf-8")).hexdigest()
        info = db_sound.get_sound_by_uid(uid)
        if info:
            db_collection.batch_insert(info)
        return {}
        

    
@api.route("/collection/remove")
class CollectionRemove(Resource):
    def post(self):
        path = request.json.get('path', "").strip("/")
        uid = hashlib.md5(path.encode("utf-8")).hexdigest()
        db_collection.del_by_uid(uid)
        return {}
