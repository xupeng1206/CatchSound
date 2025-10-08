import hashlib
import time
import re
import jieba
import spacy

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from mutagen import File
from tinytag import TinyTag
from readerwriterlock import rwlock


class SoundScanner:
    def __init__(self):
        self.info_required = [
            "uid", "name", "abs_path", "rel_path", "ext", "size", 
            "duration", "channels", "bitrate", "bitdepth",
            "samplerate", "bpm", "year", "key", "oneshot",
        ]
        self.exts_required = [
            '.mp3', '.wav', '.flac', '.aiff', '.m4a', '.ogg', '.tta', '.ape', 
            '.mpc', '.mpp', '.wv', '.wma', '.wmv', '.aif', '.mid', '.midi'
        ]
        self.exts_required_no_dot = [x[1:] for x in self.exts_required]
        self.notes = [
            'C','c','C#','c#','D','d','D#','d#','E','e','F','f','F#','f#','G','g','G#','g#',
            'A','a','A#','a#','B','b','Db','db','Eb','eb','Gb','gb','Ab','ab','Bb','bb'
        ]
        self.mid_in_chord = ["", " ", ".", "-", "_", "=", "+", "—", "@"]
        self.maj_suffix = [
            "",
            "maj", "maJ", "mAj", "mAJ",
            "Maj", "MaJ", "MAj", "MAJ",
            'major', 'majoR', 'majOr', 'majOR',
            'maJor', 'maJoR', 'maJOr', 'maJOR',
            'mAjor', 'mAjoR', 'mAjOr', 'mAjOR',
            'mAJor', 'mAJoR', 'mAJOr', 'mAJOR',
            'Major', 'MajoR', 'MajOr', 'MajOR',
            'MaJor', 'MaJoR', 'MaJOr', 'MaJOR',
            'MAjor', 'MAjoR', 'MAjOr', 'MAjOR',
            'MAJor', 'MAJoR', 'MAJOr', 'MAJOR',
        ]
        self.min_suffix = [
            "m", "M"
            'min', 'miN', 'mIn', 'mIN',
            'Min', 'MiN', 'MIn', 'MIN',
            'minor', 'minoR', 'minOr', 'minOR',
            'miNor', 'miNoR', 'miNOr', 'miNOR',
            'mInor', 'mInoR', 'mInOr', 'mInOR',
            'mINor', 'mINoR', 'mINOr', 'mINOR',
            'Minor', 'MinoR', 'MinOr', 'MinOR',
            'MiNor', 'MiNoR', 'MiNOr', 'MiNOR',
            'MInor', 'MInoR', 'MInOr', 'MInOR',
            'MINor', 'MINoR', 'MINOr', 'MINOR',
            'minnor', 'minnoR', 'minnOr', 'minnOR',
            'minNor', 'minNoR', 'minNOr', 'minNOR',
            'miNNor', 'miNNoR', 'miNNOr', 'miNNOR',
            'miNnor', 'miNnoR', 'miNnOr', 'miNnOR',
            'mInnor', 'mInnoR', 'mInnOr', 'mInnOR',
            'mInNor', 'mInNoR', 'mInNOr', 'mInNOR',
            'mINNor', 'mINNoR', 'mINNOr', 'mINNOR',
            'mINnor', 'mINnoR', 'mINnOr', 'mINnOR',
            'Minnor', 'MinnoR', 'MinnOr', 'MinnOR',
            'MinNor', 'MinNoR', 'MinNOr', 'MinNOR',
            'MiNNor', 'MiNNoR', 'MiNNOr', 'MiNNOR',
            'MiNnor', 'MiNnoR', 'MiNnOr', 'MiNnOR',
            'MInnor', 'MInnoR', 'MInnOr', 'MInnOR',
            'MInNor', 'MInNoR', 'MInNOr', 'MInNOR',
            'MINNor', 'MINNoR', 'MINNOr', 'MINNOR',
            'MINnor', 'MINnoR', 'MINnOr', 'MINnOR',
        ]
        self.major_chords = set()
        for r in self.notes:
            for m in self.mid_in_chord:
                for s in self.maj_suffix:
                    name = r+m+s
                    if name.strip(''.join(self.mid_in_chord)) == name:
                        self.major_chords.add(name)
        
        self.minor_chords = set()
        for r in self.notes:
            for m in self.mid_in_chord:
                for s in self.min_suffix:
                    name = r+m+s
                    if name.strip(''.join(self.mid_in_chord)) == name:
                        self.minor_chords.add(name)
        self.all_chords = self.major_chords | self.minor_chords
        self.nice_tags = set([
            'grime', 'blues', 'electronic', 'clap', 'fill', 'brass', 'bedroom', 'big', 'up', 'south', 'chillout',
            'trap', 'tambourine', 'dnb', 'indie', 'woodblock', 'indian', 'harmonica', 'fi', 'minimal', 'tom', 'orchestral',
            'glitch', 'deep', 'afrobeat', 'shouts', 'shoegaze', 'cello', 'country', 'jersey', 'bass', 'drumstep', 'rave',
            'disco', 'saxophone', 'eastern', 'afropop ', '808', 'jazz', 'sub', 'lo', 'fx', 'hip', 'pluggnb', 'vocoder', 
            'dubstep', 'pop', 'r&b', 'drift', 'idm', 'bongo', 'wurlitzer', 'down', 'kpop', 'viola', 'hyperpop', 'uk',
            'lo-fi', 'chiptune', 'amapiano', 'melody', 'woodwind', 'piano', 'perc', 'neo', 'techno', 'scream', 'folk', 
            'bell', 'flute', 'dream', 'timbale', 'cumbia', 'bap', 'american', 'cinematic', 'female', 'acid', 'noise',
            'breakbeat', 'hop', 'recording', 'soul', 'jungle', 'chillwave', 'sweep', 'game', 'whisper', 'phrase', 'hard',
            'key', 'chord', 'rock', 'electric', 'pad', 'guitar', 'emo', 'post', 'cymbal', 'organ', 'vocal', 'salsa', 
            'downtempo', 'ambient', 'african', 'snare', 'eurodance', 'cowbell', 'stab', 'rnb', 'male', 'boom', 'drill', 
            'heavy', 'samba', 'kick', 'trip', 'wobble', 'clavinet', 'riff', 'garage', 'middle', 'tech', 'tropical', 
            'gospel', 'funk', 'lead', 'dub', 'texture', 'room', 'classical', 'leftfield', 'latin', 'riser', 'experimental', 
            'percussion', 'staccato', 'afrobeats', 'distorted', 'live', 'atmosphere', 'afro', 'electro', 'reggae', 'rhythm', 
            'arp', 'tearout', 'edm', 'bossa', 'footwork', 'psytrance', 'asian', 'pulse', 'rage', 'phonk', 'word', 'speed', 
            'trombone', 'sax', 'flamenco', 'conga', 'acoustic', 'reggaeton', 'hardstyle', 'break', 'punk', 'club', 'metal', 
            'drum', 'dialogue', 'ensemble', 'djembe', 'string', 'house', 'jump', 'synth', 'nova', 'analog', 'progressive', 
            'saw', 'fidget', 'industrial', 'pluck', 'groove', 'melodic', 'caribbean', 'dancehall', 'impact', 'violin', 
            'french', 'shaker', 'trumpet', 'hat', 'spoken', 'future', 'dance', 'clean', 'field ', 'moombahton', 'reverse', 
            'brazilian', 'synthwave', 'global', 'trance', 'legato', 'grand', 'phase', 'layer', 'analog', 'hi', 'hh', 'smooth',
            'mute', 'tube', 'rim', 'kik', 'sn', 'snr', 'long', 'short', '8bit', 'art', 'huge', 'large', 'small', 'fuzz', 
            'snap', 'vox', 'cymbol', 'crash', 'hit', 'punch', 'stin', 'color', 'dark', 'bright', 'hype', 'blue', 'sad', 'sick',
            'amb', 'vibe', 'kk', 'cp', 'cym', 'sfx', 'gun', 'biu', 'epic', 'china', 'chinese', 'roll', 'slice', 'pattern', 'knock', 
            'drive', 'over', 'choir'])

        self.en_cut = spacy.blank("en")
        for word in self.all_chords | self.nice_tags:
            self.en_cut.tokenizer.add_special_case(word, [{"ORTH": word}])
        
        self.loop_words = set(["loops", "loop", "loop", 'lxxp', 'loopz', 'lxxxp', 'lxxps','lxxxps'])
        self.shot_words = set(["one", "shot", "shots", "shxts", "shxt", "shotz", "shxtz"])
        self.batch_size = 10000
        self.cut_cache = {}
        self.rwlock =  rwlock.RWLockWrite()

    def scan(self, root_path: str):
        
        root_path = Path(root_path)
       
        print(f"🚀 开始并行扫描...")
        start_time = time.time()

        futures = []
        counter = 0
        
        with ThreadPoolExecutor(max_workers=8) as executor:
            for file_path in root_path.rglob('*'):
                if file_path.is_file() and file_path.name[0] != "." and file_path.suffix.lower() in self.exts_required:
                    counter += 1
                    futures.append(executor.submit(self._process_single_file, file_path, root_path))
            
            for future in as_completed(futures):
                row = future.result()
                yield row
        
        total_time = time.time() - start_time
        print(f"🎉 扫描完成！处理 {counter} 个文件，耗时 {total_time:.2f} 秒")
        
    
    def _process_single_file(self, file_path: Path, root_path: Path):
        file_info = self._fetch_static_info(file_path, root_path)
        file_info, tags = self._fetch_info_by_cut(file_path, root_path, file_info)
        
        infos = {}
        for k in self.info_required:
            infos[k] = file_info.get(k, "")
        infos["tags"] = tags
        return infos
    
    def _fetch_static_info(self, file_path: Path, root_path: Path):
        try:
            stat = file_path.stat()
            relative_path = str(file_path.relative_to(root_path))
            info = {}
            try:
                tt = TinyTag.get(file_path)
                for k, v in tt.as_dict().items():
                    if k in self.info_required and v is not None:
                        info[k] = str(v[0]) if isinstance(v, list) else str(v)
            except Exception:
                info = {}
                pass
            if not info:
                try:
                    audio = File(file_path)
                    info["duration"] = str(getattr(audio.info, "length", ""))
                    info["channels"] = str(getattr(audio.info, "channels", ""))
                    info["bitrate"] = str(getattr(audio.info, "bitrate", 0)/1000.0)
                    info["samplerate"] = str(getattr(audio.info, "sample_rate", ""))
                    info["bitdepth"] = str(getattr(audio.info, "bits_per_sample", ""))
                    # for label in ["TIT2", "TPE1", "TALB", "TCON", "title", "artist", "album", "genre"]:
                    #     if label in audio.tags:
                    #         tags += audio.tags[label].text[0].split("()–-_+@[]~$%^&!.<>.:=")
                    for label in ["TBPM", "bpm"]:
                        if label in audio.tags:
                            info["bpm"] = audio.tags[label].text[0]
                    for label in ["TDRC", "date"]:
                        if label in audio.tags:
                            info["year"] = audio.tags[label].text[0]
                except Exception:
                    pass
            info.update({
                "uid": hashlib.md5(relative_path.encode("utf-8")).hexdigest(),
                "rel_path": relative_path,
                "abs_path": str(file_path),
                "name": file_path.name,
                "ext": file_path.suffix.lower(),
                "size": stat.st_size
            })
            return info
        except Exception as e:
            print(f"⚠️ 处理文件失败 {file_path}: {e}")
            return {}, []
    
    def _fetch_info_by_cut(self, file_path: Path, root_path: Path, file_info: dict):
        relative_path = str(file_path.relative_to(root_path))
        path_split = relative_path.split("/")
        words = set()
        for one in path_split:
            words |= self._mix_cut(one)
            words |= self._mix_cut(one.lower())
        is_loop = False
        if words & self.loop_words:
            is_loop = True
        is_shot = False
        if words & self.shot_words:
            is_shot = True
        if is_shot:
            file_info["oneshot"] = "1"
        elif is_loop:
            file_info["oneshot"] = "0"
        else:
            file_info["oneshot"] = ""
        
        chords = words & self.all_chords
        if chords:
            chord = chords.pop()
            chord_tag = ""
            chord_note = ""
            if chord in self.major_chords:
                chord_tag = ""
            else:
                chord_tag = "m"
            if len(chord)>1:
                if chord[1] in ["b", "#"]:
                    chord_note = chord[0].upper() + chord[1]
                else:
                    chord_note = chord[0].upper()
            else:
                chord_note = chord.upper()

            file_info["key"] = chord_note + chord_tag
        else:
            file_info["key"] = ""
        
        final_tags = []
        for word in words:
            if word in self.nice_tags:
                final_tags.append(word)
        
        return file_info, final_tags

    def _re_split_word(self, text):
        """按特殊字符分割字符串"""
        # 定义特殊字符集
        pattern = r'[()–\-_+@\[\]~$%^&!.<>,:=\'\"\s]+'
        
        # 分割并过滤空字符串
        parts = [part for part in re.split(pattern, text) if part]
        return parts
    
    def _mix_cut(self, text):
        with self.rwlock.gen_rlock():
            if text in self.cut_cache:
                return self.cut_cache[text]

        blocks = text.split()
        words = set()
        for blk in blocks:
            if blk.isascii():
                for t in self.en_cut(blk):
                    word = t.text.strip("()–-_+@[]~$%^&!.<>,:='")
                    if word:
                        word_split = self._re_split_word(word)
                        for w in word_split:
                            words.add(w)
                            words.add(w.lower())
            else:
                for t in jieba.lcut(blk):
                    word = t.strip("()–-_+@[]~$%^&!.<>.:='")
                    if word:
                        word_split = self._re_split_word(word)
                        for w in word_split:
                            words.add(w)
                            words.add(w.lower())
        with self.rwlock.gen_wlock():
            self.cut_cache[text] = words
        return words

sound_scanner = SoundScanner()
