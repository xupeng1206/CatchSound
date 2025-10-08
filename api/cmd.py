import click
import os
from config import DATA_DIR, OPENDAL_FS_ROOT
from core.scaner import sound_scanner
from extensions.ext_db_sound import db_sound


@click.command("clean_sound", help="clean sound db")
def clean_sound():
    os.system(f"rm -rf {DATA_DIR}/sound.*")


@click.command("rescan", help="rescan the audio folder, and init the duck db.")
def rescan():
    fs_gen = sound_scanner.scan(OPENDAL_FS_ROOT)
    batch_rows = []
    for row in fs_gen:
        batch_rows.append(row)
        if len(batch_rows) > 100000:
            db_sound.batch_insert(batch_rows)
            batch_rows = []
    if batch_rows:
        db_sound.batch_insert(batch_rows)

