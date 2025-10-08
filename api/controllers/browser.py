from flask_restx import Resource
from flask import request
from extensions.ext_restx import api
from config import OPENDAL_FS_ROOT
from core.browser import Browser


@api.route("/tree/folder/content")
class TreeFolderContent(Resource):

    def post(self):
        path = request.json.get('path', "").strip("/")
        return Browser.contents(path=path)


@api.route("/tree/file/branch")
class TreeFileBranch(Resource):
    
    def post(self):
        path = request.json.get("path", "").strip("/")
        if path:
            return Browser.branch(filepath=path)
        else:
            return []
