# CatchSound - 音频文件管理系统

CatchSound 是一个个人工具型的项目，实现上比较随意，够用就行。建议有nas的朋友使用，把采样放在nas上，本地编曲时从CatchSound上找采样 ，支持tag过滤和目录浏览，支持声音的预览，tag生成基于文件路径和文件名的分词，没有AI集成，扫描和搜索速度都还可以。

## 后端启动注意点：
后端容器用tail -f 先拉起来，进容器支持 python -m flask rescan 进行sample库的扫描，扫描的是/data 文件目录，之后在 用 python -m flask run --host 0.0.0.0 --port 4321 拉起服务。

后端DB用的DuckDB，所以只能单线程访问，不上gunicorn, 直接 flask run, 也不能--debug, 主打一个够用就行

## 前端构建注意点：
注意web/nginx.conf 中的/api的指向。

## 其他：
后端实现是 人工+Cursor
前端实现是 纯Cursor
