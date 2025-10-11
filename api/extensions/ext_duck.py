import os
import duckdb
import pandas as pd
from readerwriterlock import rwlock
from config import DATA_DIR


class DuckDBWALManager:
    
    def __init__(self, db_name):
        self.db_path = os.path.join(DATA_DIR, db_name)
    
    def init_app(self, app):
        self.conn = duckdb.connect(self.db_path)
        self.rwlock =  rwlock.RWLockWrite()
        self.setup_database()

    def setup_database(self):
        """初始化数据库结构"""
        with self.rwlock.gen_wlock():
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS sound_index (
                    uid VARCHAR PRIMARY KEY,
                    abs_path VARCHAR,
                    rel_path VARCHAR,
                    name VARCHAR,
                    ext VARCHAR,
                    size VARCHAR,
                    duration VARCHAR,
                    channels VARCHAR,
                    bitrate VARCHAR,
                    bitdepth VARCHAR,
                    samplerate VARCHAR,
                    bpm VARCHAR,
                    year VARCHAR,
                    key VARCHAR,
                    oneshot VARCHAR,
                    tags TEXT[],
                )
            """)

            # 创建索引
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_uid ON sound_index(uid)")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_abs_path ON sound_index(abs_path)")

    def batch_insert(self, rows):
        df = pd.DataFrame(rows)
        try:
            with self.rwlock.gen_wlock():
                self.conn.execute("SET preserve_insertion_order = false")
                self.conn.execute("SET checkpoint_threshold = '1GB'")
                self.conn.execute("SET threads = 8")
                self.conn.execute("INSERT INTO sound_index SELECT \
                                uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
                                samplerate, bpm, year, key, oneshot, tags \
                                FROM df ON CONFLICT (uid) DO NOTHING")
        except Exception as e:
            print(f"❌ 批量插入失败: {e}")
            
    def get_sound_by_or_tags(self, tags, oneshot, key, limit, offset, rand):
        tags_stc = ""
        for tag in tags:
            tags_stc += f" OR array_contains(tags,'{tag}')"
        if tags_stc:
            tags_stc = '(' + tags_stc.strip(" OR ") + ')'
            
        oneshot_stc = ""
        if oneshot:
            oneshot_stc = f" AND oneshot='{oneshot}'"
            
        key_stc = ""
        if key:
            key_stc = f" AND key='{key}'"
        
        where_stc = tags_stc + oneshot_stc + key_stc
        where_stc = where_stc.strip(" AND ")
        
        order_stc = "abs_path"
        if rand:
            order_stc = "RANDOM()"

        if where_stc:
            result = self.conn.execute(
                f"SELECT uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
                samplerate, bpm, year, key, oneshot, tags FROM sound_index WHERE {where_stc} \
                ORDER BY {order_stc} LIMIT {limit} OFFSET {offset}"
            )
        else:
            result = self.conn.execute(
                f"SELECT uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
                samplerate, bpm, year, key, oneshot, tags FROM sound_index \
                ORDER BY {order_stc} LIMIT {limit} OFFSET {offset}"
            )

        final_result = []
        while True:
            row = result.fetchone()
            if row is None:
                break
            final_result.append(dict(zip([
                "uid", "abs_path", "rel_path", "name", "ext", "size", "duration", "channels", 
                "bitrate", "bitdepth", "samplerate", "bpm", "year", "key", "oneshot", "tags"], row)))
        return final_result
    
    def get_sound_by_and_tags(self, tags, oneshot, key, limit, offset, rand):
        tags_stc = ""
        for tag in tags:
            tags_stc += f" AND array_contains(tags,'{tag}')"
        if tags_stc:
            tags_stc = '(' + tags_stc.strip(" AND ") + ')'
            
        oneshot_stc = ""
        if oneshot:
            oneshot_stc = f" AND oneshot='{oneshot}'"
            
        key_stc = ""
        if key:
            key_stc = f" AND key='{key}'"
        
        where_stc = tags_stc + oneshot_stc + key_stc
        where_stc = where_stc.strip(" AND ")
        
        order_stc = "abs_path"
        if rand:
            order_stc = "RANDOM()"
        
        if where_stc:
            result = self.conn.execute(
                f"SELECT uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
                samplerate, bpm, year, key, oneshot, tags FROM sound_index WHERE {where_stc} \
                ORDER BY {order_stc} LIMIT {limit} OFFSET {offset}"
            )
        else:
            result = self.conn.execute(
                f"SELECT uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
                samplerate, bpm, year, key, oneshot, tags FROM sound_index \
                ORDER BY {order_stc} LIMIT {limit} OFFSET {offset}"
            )

        final_result = []
        while True:
            row = result.fetchone()
            if row is None:
                break
            final_result.append(dict(zip([
                "uid", "abs_path", "rel_path", "name", "ext", "size", "duration", "channels", 
                "bitrate", "bitdepth", "samplerate", "bpm", "year", "key", "oneshot", "tags"], row)))
        return final_result
    
    def get_sound_by_uid(self, uid):
        result = self.conn.execute(
            f"SELECT uid, abs_path, rel_path, name, ext, size, duration, channels, bitrate, bitdepth, \
            samplerate, bpm, year, key, oneshot, tags FROM sound_index WHERE uid='{uid}'"
        )
        final_result = []
        while True:
            row = result.fetchone()
            if row is None:
                break
            final_result.append(dict(zip([
                "uid", "abs_path", "rel_path", "name", "ext", "size", "duration", "channels", 
                "bitrate", "bitdepth", "samplerate", "bpm", "year", "key", "oneshot", "tags"], row)))
        return final_result

    def del_by_uid(self, uid):
        with self.rwlock.gen_wlock():
            self.conn.execute(f"DELETE FROM sound_index WHERE uid='{uid}'")


db_sound = DuckDBWALManager("sound.duck")
db_collection = DuckDBWALManager("collection.duck")
