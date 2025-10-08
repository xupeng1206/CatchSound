# CatchSound Web

CatchSound Web界面 - 现代化的音频文件管理和播放系统

## 功能特性

### 🎵 音频文件管理
- **智能搜索**: 支持按文件名、路径、标签、调式、BPM等条件搜索
- **高级筛选**: 多标签组合筛选（AND/OR逻辑）
- **文件信息展示**: 显示文件名、路径、调式、BPM、时长、标签等详细信息

### 📁 Mac风格文件浏览器
- **抽屉式设计**: 类似Mac Finder的侧边栏抽屉效果
- **树形结构**: 支持文件夹展开/折叠
- **文件定位**: 从音频列表直接定位到文件浏览器中的位置
- **安全路径**: 防止路径遍历攻击

### 🎧 专业音频播放器
- **波形图可视化**: 使用WaveSurfer.js渲染音频波形
- **播放控制**: 播放/暂停、快进/快退、音量控制
- **进度控制**: 可拖拽的播放进度条
- **实时播放**: 支持点击波形图任意位置跳转播放

### 🎨 现代化UI设计
- **响应式布局**: 适配不同屏幕尺寸
- **暗色主题**: 支持明暗主题切换
- **流畅动画**: 平滑的过渡效果和交互反馈
- **无障碍设计**: 支持键盘导航和屏幕阅读器

## 技术栈

- **React 18**: 现代化的React框架
- **TypeScript**: 类型安全的JavaScript
- **Vite**: 快速的构建工具
- **Tailwind CSS**: 实用优先的CSS框架
- **WaveSurfer.js**: 专业的音频波形可视化库
- **Lucide React**: 精美的图标库
- **Axios**: HTTP客户端

## 快速开始

### 环境要求
- Node.js 16+
- npm 或 yarn

### 安装依赖
```bash
cd web
npm install
```

### 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:3000 查看应用

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 项目结构

```
web/
├── src/
│   ├── components/          # React组件
│   │   ├── FileBrowser.tsx  # 文件浏览器
│   │   ├── AudioList.tsx    # 音频列表
│   │   └── WaveformPlayer.tsx # 波形图播放器
│   ├── api/                 # API接口
│   │   └── client.ts        # API客户端
│   ├── lib/                 # 工具库
│   │   └── utils.ts         # 通用工具函数
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx            # 应用入口
│   ├── index.css           # 全局样式
│   └── globals.css         # CSS变量定义
├── public/                 # 静态资源
├── package.json           # 项目配置
├── vite.config.ts        # Vite配置
├── tailwind.config.js     # Tailwind配置
└── tsconfig.json         # TypeScript配置
```

## API接口

前端通过以下API与后端通信：

- `POST /api/sounds` - 搜索音频文件
- `POST /api/tree/folder/content` - 获取文件夹内容
- `POST /api/tree/file/branch` - 获取文件分支（用于定位）
- `POST /api/tags` - 获取可用标签
- `POST /api/file` - 获取音频文件流

## 开发指南

### 添加新功能
1. 在 `src/components/` 中创建新组件
2. 在 `src/api/client.ts` 中添加API接口
3. 在 `App.tsx` 中集成新组件

### 样式定制
- 修改 `src/globals.css` 中的CSS变量
- 在 `tailwind.config.js` 中扩展主题
- 使用Tailwind CSS类名进行样式定制

### 类型定义
- 在 `src/api/client.ts` 中定义API相关类型
- 为组件props定义TypeScript接口

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

MIT License
