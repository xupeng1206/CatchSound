import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import FileBrowser from './components/FileBrowser';
import AudioList from './components/AudioList';
import { AudioFile, FileBrowserItem } from './api/client';

function App() {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isLocateOperation, setIsLocateOperation] = useState(false);
  const [stopAudioListPlayback, setStopAudioListPlayback] = useState<(() => void) | null>(null);
  const [fileBrowserWidth, setFileBrowserWidth] = useState<number | undefined>(undefined);

  // 加载保存的文件浏览器宽度
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('fileBrowser_width');
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= 280) {
          setFileBrowserWidth(width);
        }
      }
    } catch (error) {
      console.warn('Failed to load file browser width:', error);
    }
  }, []);

  // 保存文件浏览器宽度
  const handleWidthChange = (width: number) => {
    setFileBrowserWidth(width);
    try {
      localStorage.setItem('fileBrowser_width', width.toString());
    } catch (error) {
      console.warn('Failed to save file browser width:', error);
    }
  };

  const handleFileSelect = (file: AudioFile) => {
    setSelectedFile(file);
    setSelectedFilePath(file.rel_path);
  };

  const handleBrowserFileSelect = (file: FileBrowserItem) => {
    if (file.type === 'file') {
      // 停止AudioList中的播放
      if (stopAudioListPlayback) {
        stopAudioListPlayback();
      }
      setSelectedFilePath(file.path);
      // 如果是定位操作，定位完成后重置状态
      if (isLocateOperation) {
        setIsLocateOperation(false);
      }
    }
  };

  const handlePlayFile = (file: AudioFile) => {
    setSelectedFile(file);
    setSelectedFilePath(file.rel_path);
    setIsLocateOperation(false); // 不是定位操作
  };

  const handleLocateFile = (filePath: string) => {
    setSelectedFilePath(filePath);
    setIsLocateOperation(true); // 是定位操作
    setIsFileBrowserOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 头部导航 */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">CatchSound</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {selectedFile && (
              <div className="text-sm text-muted-foreground">
                已选择: {selectedFile.name}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 左侧固定展开按钮（全局可见） */}
      <button
        onClick={() => setIsFileBrowserOpen(true)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground px-2 py-10 rounded-r shadow hover:bg-primary/90 focus:outline-none"
        title="打开文件浏览器"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 主要内容区域 */}
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="mx-auto w-full max-w-6xl px-6 flex-1 flex flex-col">
          {/* 音频列表 */}
          <div className="flex-1">
            <AudioList
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile || undefined}
              onLocateFile={handleLocateFile}
              onPlayFile={handlePlayFile}
              onStopPlaybackRef={setStopAudioListPlayback}
              isFileBrowserOpen={isFileBrowserOpen}
            />
          </div>
        </div>
      </div>

      {/* 文件浏览器抽屉 */}
      <FileBrowser
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
        onFileSelect={handleBrowserFileSelect}
        selectedFilePath={selectedFilePath}
        isLocateOperation={isLocateOperation}
        width={fileBrowserWidth}
        onWidthChange={handleWidthChange}
      />

    </div>
  );
}

export default App;
