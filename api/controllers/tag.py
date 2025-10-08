from flask_restx import Resource
from extensions.ext_restx import api
from core.scaner import sound_scanner


@api.route("/tags")
class TagList(Resource):
    
    def post(self):
        return list(sound_scanner.nice_tags)
