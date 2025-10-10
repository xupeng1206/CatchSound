import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Music, Play, Pause, Volume2, VolumeX, Download, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { FileBrowserItem, getFolderContents, getFileBranch, getAudioStream, addToCollection } from '../api/client';
import WaveSurfer from 'wavesurfer.js';

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (file: FileBrowserItem) => void;
  selectedFilePath?: string;
  isLocateOperation?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const FileBrowser: React.FC<FileBrowserProps> = ({
  isOpen,
  onClose,
  onFileSelect,
  selectedFilePath,
  isLocateOperation = false,
  onMouseEnter,
  onMouseLeave
}) => {
  const [items, setItems] = useState<FileBrowserItem[]>([]);
  // 持久化展开状态的key
  const EXPANDED_PATHS_KEY = 'fileBrowser_expandedPaths';
  const FOLDER_CONTENTS_KEY = 'fileBrowser_folderContents';
  
  // 加载保存的展开状态
  const loadExpandedPaths = (): Set<string> => {
    try {
      const saved = localStorage.getItem(EXPANDED_PATHS_KEY);
      if (saved) {
        const paths = JSON.parse(saved);
        return new Set(Array.isArray(paths) ? paths : []);
      }
    } catch (error) {
      console.warn('Failed to load expanded paths:', error);
    }
    return new Set();
  };

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => loadExpandedPaths());

  // 保存展开状态
  const saveExpandedPaths = (paths: Set<string>) => {
    try {
      localStorage.setItem(EXPANDED_PATHS_KEY, JSON.stringify(Array.from(paths)));
    } catch (error) {
      console.warn('Failed to save expanded paths:', error);
    }
  };

  // 加载保存的文件夹内容
  const loadFolderContentsCache = (): Map<string, FileBrowserItem[]> => {
    try {
      const saved = localStorage.getItem(FOLDER_CONTENTS_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('Failed to load folder contents cache:', error);
    }
    return new Map();
  };

  // 保存文件夹内容到缓存
  const saveFolderContentsCache = (path: string, contents: FileBrowserItem[]) => {
    try {
      const cache = loadFolderContentsCache();
      cache.set(path, contents);
      const data = Object.fromEntries(cache);
      localStorage.setItem(FOLDER_CONTENTS_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save folder contents cache:', error);
    }
  };


  // 清空文件夹内容缓存
  const clearFolderContentsCache = () => {
    try {
      localStorage.removeItem(FOLDER_CONTENTS_KEY);
    } catch (error) {
      console.warn('Failed to clear folder contents cache:', error);
    }
  };

  // 清空展开状态
  const clearExpandedPaths = () => {
    try {
      localStorage.removeItem(EXPANDED_PATHS_KEY);
      setExpandedPaths(new Set());
    } catch (error) {
      console.warn('Failed to clear expanded paths:', error);
    }
  };

  // 保存滚动位置
  const saveScrollPosition = () => {
    if (fileTreeRef.current) {
      savedScrollPositionRef.current = fileTreeRef.current.scrollTop;
      console.log('FileBrowser: Saved scroll position:', savedScrollPositionRef.current);
    }
  };

  // 恢复滚动位置
  const restoreScrollPosition = () => {
    if (fileTreeRef.current && savedScrollPositionRef.current > 0) {
      console.log('FileBrowser: Restoring scroll position:', savedScrollPositionRef.current);
      fileTreeRef.current.scrollTop = savedScrollPositionRef.current;
    }
  };

  // 保存定位结果到缓存（清理后重新保存）
  const saveLocateResultToCache = (branch: FileBrowserItem[]) => {
    try {
      // 清空现有缓存
      clearFolderContentsCache();
      
      // 创建新的缓存
      const cache = new Map<string, FileBrowserItem[]>();
      
      // 将定位结果作为根目录内容保存
      cache.set('', branch);
      
      // 递归保存所有子文件夹的内容
      const saveBranchToCache = (items: FileBrowserItem[]) => {
        items.forEach(item => {
          if (item.type === 'folder' && item.subs) {
            cache.set(item.path, item.subs);
            saveBranchToCache(item.subs);
          }
        });
      };
      
      saveBranchToCache(branch);
      
      // 保存到localStorage
      const data = Object.fromEntries(cache);
      localStorage.setItem(FOLDER_CONTENTS_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save locate result to cache:', error);
    }
  };

  // 从缓存重建文件树
  const rebuildTreeFromCache = () => {
    const cache = loadFolderContentsCache();
    const rootContents = cache.get('');
    
    if (rootContents) {
      // 递归重建树结构
      const rebuildTree = (items: FileBrowserItem[]): FileBrowserItem[] => {
        return items.map(item => {
          if (item.type === 'folder') {
            const cachedSubs = cache.get(item.path);
            if (cachedSubs) {
              return { ...item, subs: rebuildTree(cachedSubs) };
            }
          }
          return item;
        });
      };
      
      const rebuiltItems = rebuildTree(rootContents);
      setItems(rebuiltItems);
    }
  };

  const [loading, setLoading] = useState(false);
  
  // Audio player state
  const [selectedFile, setSelectedFile] = useState<FileBrowserItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [waveform, setWaveform] = useState<WaveSurfer | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isFileSwitching, setIsFileSwitching] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const fileTreeRef = useRef<HTMLDivElement>(null);
  const savedScrollPositionRef = useRef<number>(0);
  const [isInternalSelection, setIsInternalSelection] = useState(false);
  const fileItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // 拖拽相关状态
  const [draggedItem, setDraggedItem] = useState<FileBrowserItem | null>(null);
  
  // 收藏功能状态
  const [favoritingFiles, setFavoritingFiles] = useState<Set<string>>(new Set());
  const [successfulFiles, setSuccessfulFiles] = useState<Set<string>>(new Set());

  // 添加到收藏夹
  const handleAddToCollection = async (file: FileBrowserItem) => {
    try {
      setFavoritingFiles(prev => new Set(prev).add(file.path));
      await addToCollection(file.path);
      
      // 添加成功反馈
      setSuccessfulFiles(prev => new Set(prev).add(file.path));
      console.log(`已添加到收藏夹: ${file.name}`);
      
      // 2秒后移除成功状态
      setTimeout(() => {
        setSuccessfulFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.path);
          return newSet;
        });
      }, 2000);
      
    } catch (error) {
      console.error('添加到收藏夹失败:', error);
      // 可以在这里添加错误提示
    } finally {
      setFavoritingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
    }
  };

  // 检查是否为MIDI文件
  const isMidiFile = (fileName: string) => {
    return fileName.toLowerCase().match(/\.(mid|midi)$/i);
  };
  


  // 保存展开状态到localStorage
  useEffect(() => {
    saveExpandedPaths(expandedPaths);
  }, [expandedPaths]);


  // 加载根目录内容
  useEffect(() => {
    if (isOpen) {
      // 先尝试从缓存重建文件树
      const cache = loadFolderContentsCache();
      const rootContents = cache.get('');
      
      if (rootContents && rootContents.length > 0) {
        // 有缓存，直接重建文件树
        rebuildTreeFromCache();
      } else {
        // 没有缓存，加载根目录内容
      loadFolderContents('');
      }
    }
  }, [isOpen]);

  // 监听items变化，恢复滚动位置
  useEffect(() => {
    if (savedScrollPositionRef.current > 0) {
      console.log('FileBrowser: Items changed, restoring scroll position:', savedScrollPositionRef.current);
      // 使用requestAnimationFrame确保DOM完全更新
      requestAnimationFrame(() => {
        setTimeout(() => {
          restoreScrollPosition();
        }, 50);
      });
    }
  }, [items]);

  // 当抽屉打开且有选中文件时，重新加载波形（不自动播放）
  useEffect(() => {
    if (isOpen && selectedFile && selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i)) {
      // 延迟一点时间确保DOM已经渲染
      const timer = setTimeout(() => {
        loadAudioFile(selectedFile, false); // 不自动播放
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedFile]);

  // 移除这个useEffect，因为它会干扰loadAudioFile中的状态设置

  // 当选中文件路径变化时，定位到该文件（仅当是定位操作时）
  useEffect(() => {
    if (selectedFilePath && isOpen && isLocateOperation && !isInternalSelection) {
      // 只有定位操作时才调用 /api/tree/file/branch 重新构建文件树
      locateFile(selectedFilePath);
    }
    // 重置内部选择标志
    if (isInternalSelection) {
      setIsInternalSelection(false);
    }
  }, [selectedFilePath, isOpen, isLocateOperation, isInternalSelection]);

  // 辅助函数：在文件树中查找指定路径的项目
  const findItemByPath = (item: FileBrowserItem, targetPath: string): boolean => {
    if (item.path === targetPath) {
      return true;
    }
    if (item.subs) {
      return item.subs.some(subItem => findItemByPath(subItem, targetPath));
    }
    return false;
  };

  // 滚动到指定文件
  const scrollToFile = (filePath: string, center: boolean = true) => {
    const fileElement = fileItemRefs.current.get(filePath);
    if (fileElement && fileTreeRef.current) {
      const container = fileTreeRef.current;
      const containerRect = container.getBoundingClientRect();
      const fileRect = fileElement.getBoundingClientRect();
      
      // 计算文件元素相对于容器的位置
      const fileTop = fileRect.top - containerRect.top + container.scrollTop;
      const fileHeight = fileRect.height;
      const containerHeight = containerRect.height;
      
      let scrollTop;
      if (center) {
        // 居中显示
        scrollTop = fileTop - (containerHeight / 2) + (fileHeight / 2);
      } else {
        // 让文件显示在容器顶部附近，但不要太靠上
        const offset = 100; // 距离顶部100px的偏移
        scrollTop = fileTop - offset;
      }
      
      // 平滑滚动到目标位置
      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
    }
  };

  const loadFolderContents = async (path: string) => {
    try {
      setLoading(true);
      console.log('FileBrowser: Loading folder contents for:', path);
      
      // 先检查缓存
      const cache = loadFolderContentsCache();
      const cachedContents = cache.get(path);
      
      if (cachedContents) {
        // 使用缓存的数据
        console.log('FileBrowser: Using cached contents');
        if (path === '') {
          setItems(cachedContents);
        } else {
          setItems(prevItems => updateItemsInTree(prevItems, path, cachedContents));
        }
        setLoading(false);
        
        // 恢复滚动位置
        requestAnimationFrame(() => {
          setTimeout(() => {
            restoreScrollPosition();
          }, 50);
        });
        return;
      }
      
      // 缓存中没有，请求API
      console.log('FileBrowser: Fetching from API');
      const contents = await getFolderContents(path);
      
      // 保存到缓存
      saveFolderContentsCache(path, contents);
      
      if (path === '') {
        setItems(contents);
      } else {
        // 更新指定路径的内容
        setItems(prevItems => updateItemsInTree(prevItems, path, contents));
      }
      
      // 恢复滚动位置
      requestAnimationFrame(() => {
        setTimeout(() => {
          restoreScrollPosition();
        }, 50);
      });
    } catch (error) {
      console.error('Failed to load folder contents:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateItemsInTree = (currentItems: FileBrowserItem[], targetPath: string, newContents: FileBrowserItem[]): FileBrowserItem[] => {
    return currentItems.map(item => {
      if (item.path === targetPath) {
        return { ...item, subs: newContents };
      } else if (item.subs) {
        return { ...item, subs: updateItemsInTree(item.subs, targetPath, newContents) };
      }
      return item;
    });
  };

  const locateFile = async (filePath: string) => {
    try {
      setLoading(true);
      const branch = await getFileBranch(filePath);
      setItems(branch);
      
      // 清空展开状态
      clearExpandedPaths();
      
      // 将定位后的文件树结构保存到缓存
      saveLocateResultToCache(branch);
      
      // 展开所有父级目录
      const pathsToExpand = new Set<string>();
      const pathParts = filePath.split('/');
      let currentPath = '';
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (currentPath) {
          currentPath += '/' + pathParts[i];
        } else {
          currentPath = pathParts[i];
        }
        pathsToExpand.add(currentPath);
      }
      
      setExpandedPaths(pathsToExpand);
      
      // 定位完成后，找到目标文件并设置为选中状态
      const findAndSelectFile = (items: FileBrowserItem[], targetPath: string): FileBrowserItem | null => {
        for (const item of items) {
          if (item.path === targetPath) {
            return item;
          }
          if (item.subs) {
            const found = findAndSelectFile(item.subs, targetPath);
            if (found) return found;
          }
        }
        return null;
      };
      
      const targetFile = findAndSelectFile(branch, filePath);
      if (targetFile) {
        setSelectedFile(targetFile);
        // 如果是音频文件，加载播放器（不自动播放）
        if (targetFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i)) {
          await loadAudioFile(targetFile, false);
        }
        // 通知父组件定位完成，可以重置定位状态
        onFileSelect(targetFile);
        
        // 延迟滚动到目标文件，确保DOM已经更新
        setTimeout(() => {
          scrollToFile(filePath);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to locate file:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = async (item: FileBrowserItem) => {
    if (item.type === 'folder') {
      console.log('FileBrowser: Toggling folder:', item.path);
      
      // 保存当前滚动位置
      saveScrollPosition();
      
      const isExpanded = expandedPaths.has(item.path);
      
      if (isExpanded) {
        // 折叠
        console.log('FileBrowser: Collapsing folder');
        setExpandedPaths(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.path);
          return newSet;
        });
        
        // 折叠后立即恢复滚动位置
        requestAnimationFrame(() => {
          setTimeout(() => {
            restoreScrollPosition();
          }, 50);
        });
      } else {
        // 展开
        console.log('FileBrowser: Expanding folder');
        setExpandedPaths(prev => new Set(prev).add(item.path));
        
        // 如果还没有加载子内容，则加载
        if (!item.subs) {
          console.log('FileBrowser: Loading folder contents');
          await loadFolderContents(item.path);
        }
        
        // 目录展开时不滚动，保持目录在原位置，直接向下展开内容
      }
    } else {
      // 选择文件
      handleFileSelect(item);
    }
  };

  const handleFileSelect = async (item: FileBrowserItem) => {
    // 设置文件切换状态
    setIsFileSwitching(true);
    
    // 更新选中文件
    setSelectedFile(item);
    setIsInternalSelection(true);
    // 同步更新 selectedFilePath
      onFileSelect(item);
    
    // 平滑滚动到选中的文件
    setTimeout(() => {
      scrollToFile(item.path, true);
    }, 50);
    
    // 如果是音频文件，加载并播放
    if (item.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i)) {
      await loadAudioFile(item);
    } else {
      // 如果不是音频文件，立即清除切换状态
      setIsFileSwitching(false);
    }
  };

  const loadAudioFile = async (file: FileBrowserItem, autoPlay: boolean = true) => {
    // 防止重复加载
    if (isLoadingAudio) {
      return;
    }
    
    // MIDI文件不支持播放
    if (isMidiFile(file.name)) {
      setIsFileSwitching(false);
      return;
    }
    
    try {
      setIsLoadingAudio(true);
      
      // 完全清理之前的波形和状态
      if (waveform) {
        try {
          waveform.pause();
          waveform.destroy();
        } catch (error) {
          console.warn('Error destroying waveform:', error);
        }
        setWaveform(null);
      }
      
      if (!waveformRef.current) {
        // 等待一下再重试
        setTimeout(() => {
          if (waveformRef.current) {
            loadAudioFile(file, autoPlay);
          }
        }, 100);
        return;
      }
      
      // 获取音频流
      const audioUrl = await getAudioStream(file.path);
      console.log('FileBrowser: Audio URL:', audioUrl);
      
      // 创建波形
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#6366f1',
        progressColor: '#4f46e5',
        cursorColor: '#ef4444',
        cursorWidth: 2,
        barWidth: 2,
        barRadius: 2,
        height: 60,
        backend: 'WebAudio',
        interact: true,
      });
      
      // 设置加载超时
      const loadTimeout = setTimeout(() => {
        console.warn('Waveform loading timeout');
        setIsLoadingAudio(false);
      }, 30000); // 30秒超时
      
      await wavesurfer.load(audioUrl);
      clearTimeout(loadTimeout);
      
      // 先设置波形引用，确保状态同步
      setWaveform(wavesurfer);
      wavesurfer.setVolume(isMuted ? 0 : volume);
      
      // 确保初始状态正确
      setIsPlaying(false);
      
      // 波形加载完成，立即清除加载状态
      setIsLoadingAudio(false);
      setIsFileSwitching(false);
      
      // 先设置所有事件监听器
      wavesurfer.on('load', () => {
        console.log('FileBrowser: Waveform load event');
      });
      
      wavesurfer.on('ready', () => {
        console.log('FileBrowser: Waveform ready event');
      });
      
      wavesurfer.on('play', () => {
        console.log('FileBrowser: Waveform play event - setting isPlaying to true');
        setIsPlaying(true);
        // 强制更新，确保状态立即生效
        setTimeout(() => {
          console.log('FileBrowser: State after play event - isPlaying should be true');
        }, 0);
      });
      
      wavesurfer.on('pause', () => {
        console.log('FileBrowser: Waveform pause event');
        setIsPlaying(false);
      });
      
      wavesurfer.on('finish', () => {
        console.log('FileBrowser: Waveform finish event - audio ended');
        setIsPlaying(false);
      });
      
      wavesurfer.on('error', (error) => {
        console.error('FileBrowser: Waveform error:', error);
        setIsPlaying(false);
      });
      
      // 如果设置了自动播放，延迟一点播放确保音频完全加载
      if (autoPlay) {
        console.log('FileBrowser: Starting playback after load');
        console.log('FileBrowser: Audio duration:', wavesurfer.getDuration());
        // 延迟一点播放，确保音频完全加载
        setTimeout(() => {
          console.log('FileBrowser: Actually starting playback now');
          wavesurfer.play();
        }, 100);
      }
      
      // 添加波形点击事件
      wavesurfer.on('click', (relativeX: number) => {
        // 跳转到点击位置并开始播放
        wavesurfer.seekTo(relativeX);
        wavesurfer.play();
        // 让play事件监听器设置状态
      });
      
    } catch (error) {
      console.error('Failed to load audio file:', error);
      setIsLoadingAudio(false);
      setIsFileSwitching(false);
    }
  };

  const handlePlayPause = () => {
    console.log('FileBrowser: handlePlayPause called, isPlaying:', isPlaying, 'waveform:', !!waveform);
    if (waveform && selectedFile && selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) && !isMidiFile(selectedFile.name)) {
      if (isPlaying) {
        console.log('FileBrowser: Pausing audio');
        waveform.pause();
        // 让pause事件监听器设置状态
      } else {
        console.log('FileBrowser: Playing audio');
        waveform.play();
        // 让play事件监听器设置状态
      }
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    if (selectedFile && isMidiFile(selectedFile.name)) return;
    setVolume(newVolume);
    if (waveform) {
      waveform.setVolume(isMuted ? 0 : newVolume);
    }
  };

  const handleMuteToggle = () => {
    if (selectedFile && isMidiFile(selectedFile.name)) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (waveform) {
      waveform.setVolume(newMuted ? 0 : volume);
    }
  };


  // 拖拽开始处理
  const handleDragStart = async (e: React.DragEvent, item: FileBrowserItem) => {
    setDraggedItem(item);
    
    // 只处理音频文件
    if (!item.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i)) {
      return;
    }
    
    // 设置拖拽效果
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.dropEffect = 'copy';
      
      // 设置拖拽图像
      e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0);
      
      try {
        // 获取音频文件数据
        const audioUrl = await getAudioStream(item.path);
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        
        // 创建文件对象
        const file = new (File as any)([blob], item.name, {
          type: blob.type || 'audio/wav'
        });
        
        // 设置拖拽数据 - 使用更简单的方法
        e.dataTransfer.items.add(file);
        
        // 设置基本数据格式
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.setData('text/uri-list', audioUrl);
        
        // 设置文件下载格式
        e.dataTransfer.setData('DownloadURL', `audio/wav:${item.name}:${audioUrl}`);
        
      } catch (error) {
        console.error('FileBrowser: Failed to prepare drag data:', error);
        // 设置简单的拖拽数据作为备用
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.setData('text/uri-list', `file://${item.name}`);
      }
    }
  };

  // 拖拽放下处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedItem(null);
  };

  // 拖拽结束处理
  const handleDragEnd = () => {
    // 如果拖拽没有成功放下，延迟触发下载
    if (draggedItem) {
      setTimeout(() => {
        getAudioStream(draggedItem.path).then(url => {
          const link = document.createElement('a');
          link.href = url;
          link.download = draggedItem.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }).catch(error => {
          console.error('FileBrowser: Fallback download failed:', error);
        });
      }, 100);
    }
    
    // 清理拖拽状态
    setDraggedItem(null);
  };

  // 清理播放器状态的通用函数
  const cleanupPlayerState = () => {
    if (waveform) {
      waveform.pause();
      waveform.destroy();
      setWaveform(null);
    }
    setIsPlaying(false);
    // 不在这里清除isLoadingAudio，让loadAudioFile函数自己管理
  };


  // 备用下载函数
  const downloadFile = async (item: FileBrowserItem) => {
    try {
      const audioUrl = await getAudioStream(item.path);
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };


  // 清理波形实例
  // 组件卸载时清理播放器状态
  useEffect(() => {
    return () => {
      cleanupPlayerState();
    };
  }, [waveform]);

  // 抽屉关闭时清理播放器状态
  useEffect(() => {
    if (!isOpen) {
      cleanupPlayerState();
    }
  }, [isOpen, waveform]);

  const renderItem = (item: FileBrowserItem, level: number = 0) => {
    const isExpanded = expandedPaths.has(item.path);
    // 统一使用 selectedFile 来判断选中状态
    const isSelected = selectedFile?.path === item.path;
    
    return (
      <div key={item.path}>
        <div
          ref={(el) => {
            if (el) {
              fileItemRefs.current.set(item.path, el);
            }
          }}
          className={cn(
            "flex items-center py-1 px-2 cursor-pointer hover:bg-accent rounded-sm",
            "transition-colors duration-150",
            isSelected && "bg-primary/10 text-primary",
            draggedItem?.path === item.path && "opacity-50"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          draggable={item.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) ? true : false}
          onDragStart={(e) => handleDragStart(e, item)}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => toggleExpanded(item)}
        >
          {item.type === 'folder' ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 mr-1 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-1 flex-shrink-0" />
              )}
              <Folder className="w-4 h-4 mr-2 flex-shrink-0 text-blue-500" />
            </>
          ) : (
            <>
              <div className="w-4 h-4 mr-1 flex-shrink-0" />
              {isMidiFile(item.name) ? (
                <span className="text-lg mr-2 flex-shrink-0">🎵</span>
              ) : item.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) ? (
                <Music className="w-4 h-4 mr-2 flex-shrink-0 text-green-500" />
              ) : (
                <File className="w-4 h-4 mr-2 flex-shrink-0 text-gray-500" />
              )}
            </>
          )}
          <span className="text-sm truncate flex-1">{item.name}</span>
        </div>
        
        {item.type === 'folder' && isExpanded && item.subs && (
          <div>
            {item.subs.map(subItem => renderItem(subItem, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* 抽屉面板 */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full bg-sidebar border-r border-border z-50 flex flex-col",
        "transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: '50vw' }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-sidebar-foreground">文件浏览器</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-sm transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        {/* 文件树区域 - 可滚动 */}
        <div ref={fileTreeRef} className="flex-1 overflow-y-auto p-2 relative min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map(item => renderItem(item))}
            </div>
          )}
        </div>

        {/* 音频播放器 - 固定在抽屉底部，始终显示 */}
        <div className="border-t border-border bg-card p-3 flex-shrink-0">
          <div className="space-y-3">
            {/* 文件名和路径 */}
            {selectedFile ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {isMidiFile(selectedFile.name) ? (
                    <span className="text-lg flex-shrink-0">🎵</span>
                  ) : selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) ? (
                    <Music className="w-4 h-4 text-primary flex-shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate" title={selectedFile.name}>
                    {selectedFile.name}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate pl-6" title={selectedFile.path}>
                  {selectedFile.path}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">未选择音频文件</span>
              </div>
            )}

            {/* 波形图 */}
            <div className="h-16 bg-muted/30 border border-border rounded-lg overflow-hidden relative">
              {selectedFile && isMidiFile(selectedFile.name) ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <div className="text-lg mb-1">🎵</div>
                    <div className="text-xs">MIDI文件不支持播放</div>
                  </div>
                </div>
              ) : selectedFile && selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) ? (
                <>
                  <div ref={waveformRef} className="w-full h-full" />
                  {(isLoadingAudio || isFileSwitching) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span>加载中...</span>
                      </div>
                    </div>
                  )}
                  {!isLoadingAudio && !isFileSwitching && !waveform && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                      点击播放
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  点击音频文件开始播放
                </div>
              )}
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center gap-3">
              {/* 播放/暂停按钮 */}
              <button
                onClick={handlePlayPause}
                disabled={isLoadingAudio || !selectedFile || !selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) || (selectedFile && isMidiFile(selectedFile.name))}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  (selectedFile && isMidiFile(selectedFile.name))
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                title={selectedFile && isMidiFile(selectedFile.name) ? "MIDI文件不支持播放" : `isPlaying: ${isPlaying}, waveform: ${!!waveform}`}
              >
                {(() => {
                  console.log('FileBrowser: Button render - isPlaying:', isPlaying);
                  return isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  );
                })()}
              </button>

              {/* 音量控制 */}
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={handleMuteToggle}
                  className="p-1 hover:bg-accent rounded transition-colors"
                  disabled={selectedFile && isMidiFile(selectedFile.name)}
                  title={selectedFile && isMidiFile(selectedFile.name) ? "MIDI文件不支持音量控制" : (isMuted ? "取消静音" : "静音")}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${(isMuted ? 0 : volume) * 100}%, #e5e7eb ${(isMuted ? 0 : volume) * 100}%, #e5e7eb 100%)`
                  }}
                  disabled={selectedFile && isMidiFile(selectedFile.name)}
                  title={selectedFile && isMidiFile(selectedFile.name) ? "MIDI文件不支持音量控制" : "音量"}
                />
                <span className="text-xs text-muted-foreground w-8">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
              
              {/* 下载按钮 */}
              {selectedFile && selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) && (
                <button
                  onClick={() => downloadFile(selectedFile)}
                  className="p-2 hover:bg-accent rounded transition-colors"
                  title="下载文件"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              
              {/* 收藏按钮 */}
              {selectedFile && selectedFile.name.match(/\.(mp3|wav|flac|aiff|m4a|ogg)$/i) && (
                <button
                  onClick={() => handleAddToCollection(selectedFile)}
                  className={cn(
                    "p-2 hover:bg-accent rounded transition-colors",
                    successfulFiles.has(selectedFile.path) && "bg-red-500 text-white hover:bg-red-600"
                  )}
                  title={successfulFiles.has(selectedFile.path) ? "收藏成功！" : "添加到收藏夹"}
                  disabled={favoritingFiles.has(selectedFile.path)}
                >
                  {favoritingFiles.has(selectedFile.path) ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  ) : (
                    <Heart className={cn(
                      "w-4 h-4",
                      successfulFiles.has(selectedFile.path) && "text-white"
                    )} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
};

export default FileBrowser;
