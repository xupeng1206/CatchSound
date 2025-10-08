import os
from config import OPENDAL_FS_ROOT

class Browser:
    
    ROOT = OPENDAL_FS_ROOT
    
    @classmethod
    def _safe(cls, path):
        full = os.path.abspath(os.path.join(cls.ROOT, path.lstrip('/')))
        if not full.startswith(os.path.abspath(cls.ROOT)):
            raise Exception("path error.")
        return full

    @classmethod
    def contents(cls, path):
        full = cls._safe(path)
        if not os.path.isdir(full):
            return []
        items = []
        for name in sorted(os.listdir(full)):
            f = os.path.join(full, name)
            items.append({
                "name": name,
                "path": os.path.join(path, name).replace('\\', '/'),
                "type": 'folder' if os.path.isdir(f) else 'file',
                "subs": None,
            })
        return items

    @classmethod
    def branch(cls, filepath):
        """
        优化版本 - 只展开目标文件路径上的目录
        """
        full_path = cls._safe(filepath)
        
        if not os.path.isfile(full_path):
            raise Exception("branch函数只支持文件路径")
        
        def build_tree(path):
            """构建最小化的树形结构，只展开必要的路径"""
            contents = cls.contents(path)
            
            for item in contents:
                # 标记当前文件
                item["is_current_file"] = (item["path"] == filepath)
                
                # 如果是文件夹，判断是否需要展开
                if item["type"] == "folder":
                    item_path = item["path"]
                    # 只有当文件夹在目标文件路径上时才展开
                    if filepath.startswith(item_path + '/'):
                        item["subs"] = build_tree(item_path)
                    else:
                        item["subs"] = None
            
            return contents
        
        return build_tree("")
