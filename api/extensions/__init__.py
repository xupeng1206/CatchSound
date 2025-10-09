from .ext_db_sound import db_sound
from .ext_db_collection import db_collection
from .ext_opendal import storage
from .ext_restx import api

exts = [
    db_sound,
    db_collection,
    storage,
    api
]