import logging

from flask import Flask

logger = logging.getLogger(__name__)


def create_app() -> Flask:
    _app = Flask(__name__)
    _app.config.from_pyfile("config.py")

    from extensions import exts
    for ext in exts:
        ext.init_app(_app)
        
    from cmd import rescan, clean_sound 
    _app.cli.add_command(clean_sound)
    _app.cli.add_command(rescan)
    
    import controllers
    return _app

app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4321)
