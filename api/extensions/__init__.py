from .ext_duck import db_sound, db_collection
from .ext_opendal import storage
from .ext_restx import api

exts = [
    db_sound,
    db_collection,
    storage,
    api
]