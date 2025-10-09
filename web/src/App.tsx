import { useState, useEffect } from 'react';
import { Menu, Heart, RefreshCw } from 'lucide-react';
import FileBrowser from './components/FileBrowser';
import AudioList from './components/AudioList';
import CollectionList from './components/CollectionList';
import { AudioFile, FileBrowserItem } from './api/client';

function App() {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isLocateOperation, setIsLocateOperation] = useState(false);
  const [stopAudioListPlayback, setStopAudioListPlayback] = useState<(() => void) | null>(null);
  const [stopCollectionPlayback, setStopCollectionPlayback] = useState<(() => void) | null>(null);
  
  // 鼠标位置状态
  const [mouseInFileBrowser, setMouseInFileBrowser] = useState(false);
  const [mouseInCollection, setMouseInCollection] = useState(false);

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

  const handleCollectionFileSelect = (file: AudioFile) => {
    setSelectedFile(file);
    setSelectedFilePath(file.rel_path);
  };

  const handleCollectionPlayFile = (file: AudioFile) => {
    setSelectedFile(file);
    setSelectedFilePath(file.rel_path);
    setIsLocateOperation(false); // 不是定位操作
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
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground px-3 py-10 rounded-r shadow hover:bg-primary/90 focus:outline-none group"
        title="打开文件浏览器"
      >
        <div className="flex flex-col items-center gap-1">
          <Menu className="w-5 h-5" />
          <span className="text-xs font-medium leading-tight">文件<br/>浏览器</span>
        </div>
      </button>

      {/* 右侧固定展开按钮（全局可见） */}
      <button
        onClick={() => setIsCollectionOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground px-3 py-10 rounded-l shadow hover:bg-primary/90 focus:outline-none group"
        title="打开收藏夹"
      >
        <div className="flex flex-col items-center gap-1">
          <Heart className="w-5 h-5" />
          <span className="text-xs font-medium leading-tight">收藏<br/>夹</span>
        </div>
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
              isCollectionOpen={isCollectionOpen}
              mouseInFileBrowser={mouseInFileBrowser}
              mouseInCollection={mouseInCollection}
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
        onMouseEnter={() => setMouseInFileBrowser(true)}
        onMouseLeave={() => setMouseInFileBrowser(false)}
      />

      {/* 收藏夹抽屉 */}
      <>
        {/* 背景遮罩 */}
        {isCollectionOpen && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setIsCollectionOpen(false)}
          />
        )}
        
        {/* 抽屉面板 */}
        <div
          className={`fixed top-0 right-0 h-full bg-sidebar border-l border-border z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
            isCollectionOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ width: '50vw' }}
          onMouseEnter={() => setMouseInCollection(true)}
          onMouseLeave={() => setMouseInCollection(false)}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-sidebar-foreground">收藏夹</h2>
              <div id="collection-request-status" className="flex items-center gap-2 text-sm text-muted-foreground">
                {/* 请求状态将通过CollectionList组件更新 */}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // 触发CollectionList重新加载
                  const event = new CustomEvent('reloadCollection');
                  window.dispatchEvent(event);
                }}
                className="p-1 hover:bg-accent rounded-sm transition-colors"
                title="重新加载收藏夹"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsCollectionOpen(false)}
                className="p-1 hover:bg-accent rounded-sm transition-colors"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* 收藏夹内容 */}
          <div className="flex-1 overflow-y-auto">
            <CollectionList
              onFileSelect={handleCollectionFileSelect}
              selectedFile={selectedFile || undefined}
              onLocateFile={handleLocateFile}
              onPlayFile={handleCollectionPlayFile}
              onStopPlaybackRef={setStopCollectionPlayback}
              isFileBrowserOpen={isFileBrowserOpen}
              isCollectionOpen={isCollectionOpen}
            />
          </div>
        </div>
      </>

    </div>
  );
}

export default App;
