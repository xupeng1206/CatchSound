import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, MapPin, Music, Zap, Key, Volume2, VolumeX, Download, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { AudioFile, SearchParams, searchCollectionFiles, getAvailableTags, getAudioStream, removeFromCollection } from '../api/client';
import { requestManager } from '../lib/requestManager';
import WaveSurfer from 'wavesurfer.js';

interface CollectionListProps {
  onFileSelect: (file: AudioFile) => void;
  selectedFile?: AudioFile;
  onLocateFile: (filePath: string) => void;
  onPlayFile?: (file: AudioFile) => void;
  onStopPlaybackRef?: (stopFn: (() => void) | null) => void;
  isFileBrowserOpen?: boolean;
  isCollectionOpen?: boolean;
}

const CollectionList: React.FC<CollectionListProps> = ({
  onFileSelect,
  selectedFile,
  onLocateFile,
  onPlayFile,
  onStopPlaybackRef,
  isFileBrowserOpen = false,
  isCollectionOpen = false
}) => {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [audioRefs, setAudioRefs] = useState<Map<string, HTMLAudioElement>>(new Map());
  const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
  const [mutedFiles, setMutedFiles] = useState<Set<string>>(new Set());
  const [waveformRefs, setWaveformRefs] = useState<Map<string, WaveSurfer>>(new Map());
  const waveformContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [loadingWaveforms, setLoadingWaveforms] = useState<Set<string>>(new Set());
  const waveformPromisesRef = useRef<Map<string, Promise<WaveSurfer | null>>>(new Map());
  const [searchParams, setSearchParams] = useState<SearchParams>({
    limit: 50,
    offset: 0,
    tags: [],
    oneshot: '',
    key: '',
    op: 'AND'
  });
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [selectedTonality, setSelectedTonality] = useState<string>('');
  const [isRandom, setIsRandom] = useState<boolean>(true); // 默认开启随机
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  
  // 标签输入框相关状态
  const [tagInput, setTagInput] = useState<string>('');
  const [showTagDropdown, setShowTagDropdown] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  
  // Tooltip状态
  const [tooltip, setTooltip] = useState<{ show: boolean; content: string; x: number; y: number }>({
    show: false,
    content: '',
    x: 0,
    y: 0
  });

  // 拖拽相关状态
  const [draggedFile, setDraggedFile] = useState<AudioFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // 批量下载功能
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // 删除功能状态
  const [removingFiles, setRemovingFiles] = useState<Set<string>>(new Set());
  const [successfulFiles, setSuccessfulFiles] = useState<Set<string>>(new Set());
  
  // 重新加载状态
  const [isReloading, setIsReloading] = useState(false);
  
  // 请求状态
  const [requestStatus, setRequestStatus] = useState({ queueLength: 0, isProcessing: false });

  // 监听请求状态
  useEffect(() => {
    const updateRequestStatus = () => {
      const status = requestManager.getQueueStatus();
      setRequestStatus(status);
      
      // 更新App.tsx中的请求状态显示
      const statusElement = document.getElementById('collection-request-status');
      if (statusElement) {
        if (status.isProcessing) {
          statusElement.innerHTML = `
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>请求队列: ${status.queueLength}</span>
            </div>
          `;
        } else {
          statusElement.innerHTML = '';
        }
      }
    };
    
    // 初始状态
    updateRequestStatus();
    
    // 定期更新状态
    const interval = setInterval(updateRequestStatus, 500);
    
    return () => clearInterval(interval);
  }, []);

  // 全局拖拽检测
  useEffect(() => {
    const handleGlobalDrop = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [isDragging]);
  

  // 加载可用标签
  useEffect(() => {
    loadAvailableTags();
  }, []);

  // 搜索音频文件：根据筛选项变化决定重置或追加
  const prevSearchKeyRef = useRef<string>("");
  useEffect(() => {
    const currentKey = JSON.stringify({
      tags: selectedTags,
      oneshot: searchParams.oneshot,
      key: searchParams.key,
      op: searchParams.op,
      rand: isRandom,
      limit: searchParams.limit,
      _refresh: searchParams._refresh, // 包含刷新时间戳
    });
    const reset = prevSearchKeyRef.current !== currentKey;
    searchFiles(reset);
    prevSearchKeyRef.current = currentKey;
  }, [selectedTags, searchParams.oneshot, searchParams.key, searchParams.op, isRandom, searchParams.limit, searchParams._refresh]);

  // 监听isCollectionOpen变化，当收藏夹打开时刷新数据
  useEffect(() => {
    if (isCollectionOpen) {
      // 重置搜索参数
      setSearchParams({
        tags: [],
        page: 1,
        pageSize: 20
      });
      // 重新搜索
      searchFiles(true);
    }
  }, [isCollectionOpen]);

  // 监听重新加载事件
  useEffect(() => {
    const handleReloadEvent = () => {
      handleReload();
    };
    
    window.addEventListener('reloadCollection', handleReloadEvent);
    return () => {
      window.removeEventListener('reloadCollection', handleReloadEvent);
    };
  }, []);

  // 当筛选条件变化时，停止上一状态下的所有播放
  useEffect(() => {
    // 停止 HTMLAudio 播放
    audioRefs.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    });
    // 停止 WaveSurfer 播放
    waveformRefs.forEach((wf) => {
      try {
        wf.pause();
        wf.seekTo(0);
      } catch {}
    });
    setPlayingFile(null);
  }, [selectedTags, searchParams.oneshot, searchParams.key, searchParams.op]);

  // 点击外部关闭标签下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const dropdown = document.querySelector('[data-tag-dropdown]');
      
      if (tagInputRef.current && 
          !tagInputRef.current.contains(target) && 
          (!dropdown || !dropdown.contains(target))) {
        setShowTagDropdown(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadAvailableTags = async () => {
    try {
      const tags = await getAvailableTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const searchFiles = async (reset = true) => {
    try {
      setLoading(true);
      const params = {
        ...searchParams,
        tags: selectedTags,
        rand: isRandom,
        offset: reset ? 0 : files.length, // 重置时offset=0，否则使用当前文件数量
        limit: searchParams.limit || 50
      };
      
      const results = await searchCollectionFiles(params);
      
      if (reset) {
        setFiles(results);
      } else {
        setFiles(prev => [...prev, ...results]);
      }
      
      setHasMore(results.length >= (params.limit || 50));
    } catch (error) {
      console.error('Failed to search files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!loading && hasMore) {
      try {
        setLoading(true);
        const currentOffset = files.length; // 使用当前文件数量作为offset
        const params = {
          ...searchParams,
          tags: selectedTags,
          rand: isRandom,
          offset: currentOffset,
          limit: searchParams.limit || 50
        };
        
        const results = await searchCollectionFiles(params);
        
        // 追加新结果到现有列表
        setFiles(prev => [...prev, ...results]);
        
        // 更新hasMore状态
        setHasMore(results.length >= (params.limit || 50));
      } catch (error) {
        console.error('Failed to load more files:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const refreshRandom = () => {
    if (!loading) {
      // 先清空文件列表，然后重新获取随机结果
      setFiles([]);
      setSearchParams(prev => ({
        ...prev,
        offset: 0,
        _refresh: Date.now() // 添加时间戳强制刷新
      }));
    }
  };


  // 过滤标签候选值
  const filteredTags = availableTags.filter(tag => 
    tag.toLowerCase().includes(tagInput.toLowerCase()) && 
    !selectedTags.includes(tag)
  );

  // 处理标签输入框变化
  const handleTagInputChange = (value: string) => {
    setTagInput(value);
    setShowTagDropdown(true);
    setHighlightedIndex(-1);
  };

  // 选择标签
  const selectTag = (tag: string) => {
    console.log('selectTag called with:', tag); // 调试信息
    if (!selectedTags.includes(tag)) {
      setSelectedTags(prev => [...prev, tag]);
    }
    setTagInput('');
    setShowTagDropdown(false);
    setHighlightedIndex(-1);
  };

  // 移除选中的标签
  const removeTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  // 键盘导航
  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (!showTagDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredTags.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredTags.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredTags[highlightedIndex]) {
          selectTag(filteredTags[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowTagDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };


  // 备用下载函数
  const downloadFile = async (file: AudioFile) => {
    try {
      const audioUrl = await getAudioStream(file.rel_path);
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('AudioList: Failed to download file:', error);
    }
  };

  // 批量下载函数
  const downloadSelectedFiles = async () => {
    const selectedFilesList = files.filter(file => selectedFiles.has(file.uid));
    for (const file of selectedFilesList) {
      await downloadFile(file);
      // 添加小延迟避免浏览器阻止多个下载
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    setSelectedFiles(new Set());
  };

  // 切换文件选择状态
  const toggleFileSelection = (fileUid: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileUid)) {
        newSet.delete(fileUid);
      } else {
        newSet.add(fileUid);
      }
      return newSet;
    });
  };

  // 重新加载组件
  const handleReload = () => {
    setIsReloading(true);
    // 重置所有状态
    setFiles([]);
    setSelectedTags([]);
    setSearchParams({
      oneshot: '',
      key: '',
      op: 'AND'
    });
    setSelectedKey('');
    setSelectedTonality('');
    setIsRandom(true);
    setHasMore(true);
    setPlayingFile(null);
    setVolumes(new Map());
    setMutedFiles(new Set());
    setRemovingFiles(new Set());
    setSuccessfulFiles(new Set());
    setSelectedFiles(new Set());
    setLoadingWaveforms(new Set());
    
    // 清理波形实例
    waveformRefs.forEach((wf) => {
      try {
        wf.destroy();
      } catch {}
    });
    setWaveformRefs(new Map());
    waveformContainersRef.current.clear();
    waveformPromisesRef.current.clear();
    
    // 清理音频引用
    audioRefs.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    });
    setAudioRefs(new Map());
    
    // 延迟重新加载，确保状态清理完成
    setTimeout(() => {
      setIsReloading(false);
      // 触发重新搜索
      setSearchParams(prev => ({
        ...prev,
        _refresh: Date.now()
      }));
    }, 100);
  };

  // 从收藏夹删除
  const handleRemoveFromCollection = async (file: AudioFile) => {
    try {
      setRemovingFiles(prev => new Set(prev).add(file.uid));
      await removeFromCollection(file.rel_path);
      
      // 添加成功反馈
      setSuccessfulFiles(prev => new Set(prev).add(file.uid));
      console.log(`已从收藏夹删除: ${file.name}`);
      
      // 从UI中移除该文件
      setFiles(prev => prev.filter(f => f.uid !== file.uid));
      
      // 2秒后移除成功状态
      setTimeout(() => {
        setSuccessfulFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.uid);
          return newSet;
        });
      }, 2000);
      
    } catch (error) {
      console.error('从收藏夹删除失败:', error);
      // 可以在这里添加错误提示
    } finally {
      setRemovingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.uid);
        return newSet;
      });
    }
  };

  // Tooltip延迟定时器
  const tooltipTimeoutRef = useRef<number | null>(null);

  // Tooltip函数
  const showTooltip = (e: React.MouseEvent, content: string) => {
    // 清除之前的定时器
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    
    // 设置2秒延迟
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({
        show: true,
        content,
        x: e.clientX,
        y: e.clientY
      });
    }, 2000);
  };

  const hideTooltip = () => {
    // 清除定时器
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setTooltip(prev => ({ ...prev, show: false }));
  };

  // 停止所有播放的函数
  const stopAllPlayback = () => {
    // 停止所有HTML Audio播放
    audioRefs.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    
    // 停止所有波形播放
    waveformRefs.forEach((waveform) => {
      waveform.pause();
      waveform.seekTo(0);
    });
    
    // 重置播放状态
    setPlayingFile(null);
  };

  // 注册停止播放函数到父组件
  useEffect(() => {
    if (onStopPlaybackRef) {
      onStopPlaybackRef(stopAllPlayback);
      return () => onStopPlaybackRef(null);
    }
  }, [onStopPlaybackRef]);


  // 拖拽开始处理
  const handleDragStart = async (e: React.DragEvent, file: AudioFile) => {
    setDraggedFile(file);
    setIsDragging(true);
    
    // 设置拖拽效果
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.dropEffect = 'copy';
      
      // 设置拖拽图像
      e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0);
      
      try {
        // 获取音频文件数据
        const audioUrl = await getAudioStream(file.rel_path);
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        
        // 创建文件对象
        const audioFile = new (File as any)([blob], file.name, {
          type: blob.type || 'audio/wav'
        });
        
        // 设置拖拽数据
        e.dataTransfer.items.add(audioFile);
        
        // 设置基本数据格式
        e.dataTransfer.setData('text/plain', file.name);
        e.dataTransfer.setData('text/uri-list', audioUrl);
        
        // 尝试设置文件下载格式
        try {
          e.dataTransfer.setData('DownloadURL', `audio/wav:${file.name}:${audioUrl}`);
        } catch (err) {
          // DownloadURL not supported
        }
        
        // 尝试设置文件系统格式
        try {
          e.dataTransfer.setData('application/x-moz-file', audioUrl);
        } catch (err) {
          // application/x-moz-file not supported
        }
        
        // 尝试设置HTML5文件格式
        try {
          e.dataTransfer.setData('text/html', `<a href="${audioUrl}" download="${file.name}">${file.name}</a>`);
        } catch (err) {
          // text/html not supported
        }
        
      } catch (error) {
        console.error('AudioList: Failed to prepare drag data:', error);
        // 设置简单的拖拽数据作为备用
        e.dataTransfer.setData('text/plain', file.name);
        e.dataTransfer.setData('text/uri-list', `file://${file.name}`);
      }
    }
  };

  // 拖拽放下处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedFile(null);
    setIsDragging(false);
  };

  // 拖拽结束处理
  const handleDragEnd = () => {
    // 如果拖拽没有成功放下，延迟触发下载
    if (draggedFile && isDragging) {
      // 稍微延长延迟，给外部拖拽更多时间
      setTimeout(() => {
        // 显示用户友好的提示
        console.log(`正在下载文件: ${draggedFile.name}`);
        downloadFile(draggedFile).catch(error => {
          console.error('AudioList: Fallback download failed:', error);
        });
      }, 200);
    }
    
    // 清理拖拽状态
    setDraggedFile(null);
    setIsDragging(false);
  };


  const handleOneshotChange = (value: string) => {
    setSearchParams(prev => ({
      ...prev,
      oneshot: value === prev.oneshot ? '' : value
    }));
  };

  // 组合音名和调性
  const getCombinedKey = (key: string, tonality: string): string => {
    if (!key || !tonality) return '';
    return tonality === 'Minor' ? `${key}m` : key;
  };

  const handleKeyChange = (value: string) => {
    const newKey = value === selectedKey ? '' : value;
    setSelectedKey(newKey);
    
    // 更新组合后的key参数
    const combinedKey = getCombinedKey(newKey, selectedTonality);
    setSearchParams(prev => ({
      ...prev,
      key: combinedKey
    }));
  };

  const handleTonalityChange = (value: string) => {
    const newTonality = value === selectedTonality ? '' : value;
    setSelectedTonality(newTonality);
    
    // 更新组合后的key参数
    const combinedKey = getCombinedKey(selectedKey, newTonality);
    setSearchParams(prev => ({
      ...prev,
      key: combinedKey
    }));
  };

  const handleRandomToggle = () => {
    setIsRandom(!isRandom);
  };

  const formatDuration = (duration: string) => {
    if (!duration) return '';
    const seconds = parseFloat(duration);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 检查是否为MIDI文件
  const isMidiFile = (fileName: string) => {
    return fileName.toLowerCase().match(/\.(mid|midi)$/i);
  };



  // 播放/暂停函数（用于播放按钮）
  const handlePlayPause = async (file: AudioFile, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // MIDI文件不支持播放
    if (isMidiFile(file.name)) {
      return;
    }
    
    try {
      let audio = audioRefs.get(file.uid);
      
      if (!audio) {
        // 创建新的音频元素
        const audioUrl = await getAudioStream(file.rel_path);
        audio = new Audio(audioUrl);
        audio.preload = 'metadata';
        
        // 设置事件监听
        audio.addEventListener('ended', () => {
          setPlayingFile(null);
        });
        
        audio.addEventListener('error', () => {
          console.error('Audio playback error');
          setPlayingFile(null);
        });

        // 同步播放指针
        audio.addEventListener('timeupdate', () => {
          if (!isNaN(audio!.duration) && audio!.duration > 0) {
            const ratio = Math.min(1, Math.max(0, audio!.currentTime / audio!.duration));
            const wf = waveformRefs.get(file.uid);
            if (wf) {
              // 同步波形位置
              wf.seekTo(ratio);
            }
          }
        });
        
        // 保存音频引用
        setAudioRefs(prev => new Map(prev).set(file.uid, audio!));
        
        // 设置默认音量
        if (!volumes.has(file.uid)) {
          setVolumes(prev => new Map(prev).set(file.uid, 1.0));
        }
      }
      
      if (playingFile === file.uid) {
        // 暂停当前播放
        audio.pause();
        setPlayingFile(null);
        
        // 同步波形图暂停状态
        const waveform = waveformRefs.get(file.uid);
        if (waveform) {
          waveform.pause();
        }
      } else {
        // 停止其他正在播放的音频
        if (playingFile) {
          const currentAudio = audioRefs.get(playingFile);
          if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
          }
          
          // 停止其他波形图播放
          const currentWaveform = waveformRefs.get(playingFile);
          if (currentWaveform) {
            currentWaveform.pause();
            currentWaveform.seekTo(0);
          }
        }
        
        // 播放新音频
        const volume = volumes.get(file.uid) || 1.0;
        const isMuted = mutedFiles.has(file.uid);
        audio.volume = isMuted ? 0 : volume;
        await audio.play();
        setPlayingFile(file.uid);
        
        // 创建波形图（如果还没有）
        if (!waveformRefs.has(file.uid)) {
          const container = waveformContainersRef.current.get(file.uid);
          if (container) {
            createWaveform(file, container);
          }
        } else {
          // 如果波形已存在，确保有finish事件监听器并播放
          const waveform = waveformRefs.get(file.uid);
          if (waveform) {
            // 添加新的finish事件监听器
            waveform.on('finish', () => {
              setPlayingFile(null);
            });
            // 同步波形图播放状态
            waveform.play();
          }
        }
        
        // 通知父组件
        if (onPlayFile) {
          onPlayFile(file);
        }
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const handleVolumeChange = (file: AudioFile, volume: number) => {
    if (isMidiFile(file.name)) return;
    
    setVolumes(prev => new Map(prev).set(file.uid, volume));
    
    const audio = audioRefs.get(file.uid);
    if (audio && !mutedFiles.has(file.uid)) {
      audio.volume = volume;
    }
    const wf = waveformRefs.get(file.uid);
    if (wf) {
      wf.setVolume(mutedFiles.has(file.uid) ? 0 : volume);
    }
  };

  const handleMuteToggle = (file: AudioFile) => {
    if (isMidiFile(file.name)) return;
    
    const isMuted = mutedFiles.has(file.uid);
    const newMutedFiles = new Set(mutedFiles);
    
    if (isMuted) {
      newMutedFiles.delete(file.uid);
    } else {
      newMutedFiles.add(file.uid);
    }
    
    setMutedFiles(newMutedFiles);
    
    const audio = audioRefs.get(file.uid);
    if (audio) {
      audio.volume = isMuted ? (volumes.get(file.uid) || 1.0) : 0;
    }
    const wf = waveformRefs.get(file.uid);
    if (wf) {
      wf.setVolume(isMuted ? (volumes.get(file.uid) || 1.0) : 0);
    }
  };

  // 创建波形图
  const createWaveform = async (file: AudioFile, container: HTMLDivElement) => {
    try {
      // MIDI文件不支持波形显示
      if (isMidiFile(file.name)) {
        return null;
      }
      
      // 如果已经存在，直接返回
      if (waveformRefs.has(file.uid)) {
        return waveformRefs.get(file.uid);
      }
      // 如果正在创建或已触发创建，复用同一个 Promise，避免重复渲染
      const existingPromise = waveformPromisesRef.current.get(file.uid);
      if (existingPromise) {
        return existingPromise;
      }

      const creationPromise = (async () => {
        // 清理已存在的波形实例
        const existingWaveform = waveformRefs.get(file.uid);
        if (existingWaveform) {
          try {
            existingWaveform.destroy();
          } catch (error) {
            console.warn('Error destroying existing waveform:', error);
          }
          setWaveformRefs(prev => {
            const m = new Map(prev);
            m.delete(file.uid);
            return m;
          });
        }
        
        const audioUrl = await getAudioStream(file.rel_path);

        const wavesurfer = WaveSurfer.create({
          container,
          waveColor: '#6366f1',
          progressColor: '#4f46e5',
          cursorColor: '#ef4444',
          cursorWidth: 3,
          barWidth: 2,
          barRadius: 2,
          height: 56,
          normalize: true,
          backend: 'WebAudio',
          mediaControls: false,
          interact: false,
        });

        // 添加加载完成事件监听
        wavesurfer.on('ready', () => {
          // 波形加载完成，可以移除加载状态
          setLoadingWaveforms(prev => {
            const s = new Set(prev);
            s.delete(file.uid);
            return s;
          });
        });

        await wavesurfer.load(audioUrl);

        // 使用 wavesurfer 驱动进度
        wavesurfer.on('timeupdate', () => {
          const duration = wavesurfer.getDuration() || 0;
          if (duration > 0) {
            // 可以在这里添加进度处理逻辑
          }
        });

        // 添加播放结束事件监听
        wavesurfer.on('finish', () => {
          setPlayingFile(null);
        });

        // 保存引用
        setWaveformRefs(prev => new Map(prev).set(file.uid, wavesurfer));
        waveformContainersRef.current.set(file.uid, container);

        return wavesurfer;
      })();

      waveformPromisesRef.current.set(file.uid, creationPromise);

      const result = await creationPromise;
      waveformPromisesRef.current.delete(file.uid);

      return result;
    } catch (error) {
      console.error('Failed to create waveform:', error);
      return null;
    }
  };

  // 清理音频资源
  useEffect(() => {
    return () => {
      audioRefs.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      
      waveformRefs.forEach(wf => {
        wf.destroy();
      });
    };
  }, []);

  return (
    <div className={`flex-1 flex flex-col bg-background ${isFileBrowserOpen ? 'overflow-hidden' : ''}`}>
      {/* 筛选器 */}
      <div className="p-4 border-b border-border">
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            {/* 标签筛选 */}
            <div>
              <label className="text-sm font-medium mb-2 block">标签</label>
            
            {/* 已选中的标签 */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTags.map(tag => (
                  <div
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full"
                  >
                    <span>{tag}</span>
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:bg-primary-foreground/20 rounded-full p-0.5"
                    >
                      ×
                  </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* 标签输入框 */}
            <div className="relative">
            <input
                ref={tagInputRef}
              type="text"
                value={tagInput}
                onChange={(e) => handleTagInputChange(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                onFocus={() => setShowTagDropdown(true)}
                placeholder="输入标签名称..."
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              
              {/* 下拉候选列表 */}
              {showTagDropdown && filteredTags.length > 0 && (
                <div 
                  data-tag-dropdown
                  className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {filteredTags.map((tag, index) => (
                    <div
                      key={tag}
                      onMouseDown={(e) => {
                        console.log('Mouse down on tag:', tag); // 调试信息
                        e.preventDefault();
                        e.stopPropagation();
                        selectTag(tag);
                      }}
            className={cn(
                        "px-3 py-2 text-sm cursor-pointer hover:bg-accent select-none",
                        index === highlightedIndex && "bg-accent"
                      )}
                    >
                      {tag}
          </div>
                  ))}
                </div>
              )}
              
              {/* 无匹配结果提示 */}
              {showTagDropdown && filteredTags.length === 0 && tagInput && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg">
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    没有找到匹配的标签
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 批量下载按钮 */}
          {selectedFiles.size > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={downloadSelectedFiles}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                下载选中文件 ({selectedFiles.size})
              </button>
              <button
                onClick={() => setSelectedFiles(new Set())}
                className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
              >
                取消选择
          </button>
        </div>
          )}

          {/* 筛选控制行 */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* 多标签关系 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">多标签关系</label>
                  <button
                onClick={() => setSearchParams(prev => ({ ...prev, op: 'AND' }))}
                    className={cn(
                  "btn btn-sm",
                  (searchParams.op || 'AND') === 'AND' ? "btn-primary" : "btn-outline"
            )}
                title="所有标签均需匹配"
          >
                AND
                  </button>
                  <button
                onClick={() => setSearchParams(prev => ({ ...prev, op: 'OR' }))}
                    className={cn(
                  "btn btn-sm",
                  (searchParams.op || 'AND') === 'OR' ? "btn-primary" : "btn-outline"
                )}
                title="匹配任意一个标签"
              >
                OR
                  </button>
            </div>

            {/* 类型 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">类型</label>
                <button
                  onClick={() => handleOneshotChange('1')}
                  className={cn(
                    "btn btn-sm",
                    searchParams.oneshot === '1' ? "btn-primary" : "btn-outline"
                  )}
                >
                  OneShot
                </button>
                <button
                  onClick={() => handleOneshotChange('0')}
                  className={cn(
                    "btn btn-sm",
                    searchParams.oneshot === '0' ? "btn-primary" : "btn-outline"
                  )}
                >
                  Loop
                </button>
              </div>

            {/* 音名下拉框 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">音名</label>
              <select
                value={selectedKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                className="btn btn-sm bg-background border-border hover:bg-accent"
              >
                <option value="">未选</option>
                {['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>

            {/* 调性 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">调性</label>
              <select
                value={selectedTonality}
                onChange={(e) => handleTonalityChange(e.target.value)}
                className="btn btn-sm bg-background border-border hover:bg-accent"
              >
                <option value="">未选</option>
                <option value="Major">Major</option>
                <option value="Minor">Minor</option>
              </select>
            </div>

            {/* 随机按钮 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">随机</label>
                  <button
                onClick={handleRandomToggle}
                    className={cn(
                      "btn btn-sm",
                  isRandom ? "btn-primary" : "btn-outline"
                    )}
                  >
                {isRandom ? "开启" : "关闭"}
                  </button>
              {/* 当随机开启时显示刷新按钮 */}
              {isRandom && (
                <button
                  onClick={refreshRandom}
                  disabled={loading}
                  className="btn btn-sm btn-outline"
                  title="刷新随机结果"
                >
                  {loading ? '刷新中...' : '刷新'}
                  </button>
              )}
              </div>
            </div>
          </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {/* 提示文本 */}
            {files.length > 0 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-b border-border/50 mb-2">
                💡 点击任意音频文件即可播放
              </div>
            )}
            {files.map(file => (
              <div
                key={file.uid}
                className={cn(
                  "p-1 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-sm",
                  selectedFile?.uid === file.uid
                    ? "bg-primary/10 border-primary shadow-sm"
                    : "bg-card hover:bg-accent/50",
                  playingFile === file.uid && "ring-2 ring-primary/20",
                  draggedFile?.uid === file.uid && "opacity-50",
                  selectedFiles.has(file.uid) && "bg-blue-50 border-blue-300"
                )}
                draggable
                onDragStart={(e) => handleDragStart(e, file)}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => e.preventDefault()}
                onDragLeave={() => {}}
                onMouseEnter={(e) => showTooltip(e, file.rel_path)}
                onMouseLeave={hideTooltip}
                onMouseMove={(e) => showTooltip(e, file.rel_path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // 创建右键菜单
                  const menu = document.createElement('div');
                  menu.style.cssText = `
                    position: fixed;
                    top: ${e.clientY}px;
                    left: ${e.clientX}px;
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    z-index: 1000;
                    padding: 8px 0;
                    min-width: 120px;
                  `;
                  
                  const downloadOption = document.createElement('div');
                  downloadOption.textContent = '下载文件';
                  downloadOption.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                  `;
                  downloadOption.onmouseover = () => {
                    downloadOption.style.backgroundColor = '#f0f0f0';
                  };
                  downloadOption.onmouseout = () => {
                    downloadOption.style.backgroundColor = 'transparent';
                  };
                  downloadOption.onclick = () => {
                    downloadFile(file).catch(error => {
                      console.error('Download failed:', error);
                    });
                    document.body.removeChild(menu);
                  };
                  
                  menu.appendChild(downloadOption);
                  document.body.appendChild(menu);
                  
                  // 点击其他地方关闭菜单
                  const closeMenu = (e: MouseEvent) => {
                    if (!menu.contains(e.target as Node)) {
                      document.body.removeChild(menu);
                      document.removeEventListener('click', closeMenu);
                    }
                  };
                  setTimeout(() => {
                    document.addEventListener('click', closeMenu);
                  }, 0);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(file);
                  // 仅触发一次播放路径：若已有波形，用波形；否则创建波形后再播放
                  (async () => {
                    // 停止所有非当前项的播放（音频与波形）
                    audioRefs.forEach((a, uid) => {
                      if (uid !== file.uid) {
                        a.pause();
                        a.currentTime = 0;
                      }
                    });
                    waveformRefs.forEach((wf, uid) => {
                      if (uid !== file.uid) {
                        wf.pause();
                        wf.seekTo(0);
                      }
                    });

                    const volume = volumes.get(file.uid) || 1.0;
                    const isMuted = mutedFiles.has(file.uid);
                    let wfExisting = waveformRefs.get(file.uid);
                    const container = waveformContainersRef.current.get(file.uid);
                    // 如果存在旧的波形实例，直接使用
                    if (wfExisting) {
                      // 不需要检查容器是否为空，直接使用现有波形
                    }
                    if (wfExisting) {
                      // 确保有finish事件监听器
                      wfExisting.on('finish', () => {
                        setPlayingFile(null);
                      });
                      wfExisting.seekTo(0);
                      wfExisting.setVolume(isMuted ? 0 : volume);
                      wfExisting.play();
                      setPlayingFile(file.uid);
                      if (onPlayFile) onPlayFile(file);
                      return;
                    }
                    if (container) {
                      setLoadingWaveforms(prev => new Set(prev).add(file.uid));
                      const wf = await createWaveform(file, container);
                      if (wf) {
                        wf.seekTo(0);
                        wf.setVolume(isMuted ? 0 : volume);
                        wf.play();
                        setPlayingFile(file.uid);
                        if (onPlayFile) onPlayFile(file);
                        setLoadingWaveforms(prev => { const s = new Set(prev); s.delete(file.uid); return s; });
                        return;
                      }
                      setLoadingWaveforms(prev => { const s = new Set(prev); s.delete(file.uid); return s; });
                    }
                    // 回退：仅在无法创建波形时使用 HTMLAudio
                    let audio = audioRefs.get(file.uid);
                    if (!audio) {
                      const audioUrl = await getAudioStream(file.rel_path);
                      audio = new Audio(audioUrl);
                      audio.preload = 'metadata';
                      setAudioRefs(prev => new Map(prev).set(file.uid, audio!));
                    }
                    audio!.currentTime = 0;
                    audio!.volume = isMuted ? 0 : volume;
                    await audio!.play();
                    setPlayingFile(file.uid);
                    if (onPlayFile) onPlayFile(file);
                  })();
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.uid)}
                        onChange={() => toggleFileSelection(file.uid)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      {isMidiFile(file.name) ? (
                        <span className="text-lg flex-shrink-0">🎵</span>
                      ) : (
                        <Music className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      )}
                      <h3 className="font-medium truncate">{file.name}</h3>
                      {playingFile === file.uid && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                          <span className="text-xs text-primary font-medium">正在播放</span>
                        </div>
                      )}
                      {file.oneshot !== '' && (
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs rounded-full",
                            file.oneshot === '1'
                              ? "bg-orange-100 text-orange-800"
                              : "bg-blue-100 text-blue-800"
                          )}
                        >
                          {file.oneshot === '1' ? 'OneShot' : 'Loop'}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-0 truncate">
                      {file.key && (
                        <span className="mr-2">
                          <Key className="w-3 h-3 inline mr-1" />
                          {file.key}
                        </span>
                      )}
                      {file.duration && (
                        <span className="mr-2">{formatDuration(file.duration)}</span>
                      )}
                      <span>{file.rel_path}</span>
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {file.bpm && (
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          <span>{file.bpm} BPM</span>
                        </div>
                      )}
                    </div>
                    
                    {file.tags && file.tags.length > 0 && (
                      <div className="flex flex-nowrap gap-1 mt-0.5 max-h-5 overflow-hidden">
                        {file.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-[10px] bg-secondary text-secondary-foreground rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {file.tags.length > 3 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            +{file.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* 波形图区域（可点击定位播放） */}
                  <div className="w-80 h-16 bg-muted/30 border-2 border-black rounded-lg relative cursor-pointer hover:border-gray-700 transition-colors">
                    {isMidiFile(file.name) ? (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        <div className="text-center">
                          <div className="text-lg mb-1">🎵</div>
                          <div className="text-xs">MIDI文件不支持播放</div>
                        </div>
                      </div>
                    ) : (
                      <div
                        ref={(el) => {
                          if (el) {
                            // 直接更新ref，不触发重新渲染
                            waveformContainersRef.current.set(file.uid, el);
                          }
                        }}
                        className="w-full h-full"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          const el = evt.currentTarget as HTMLDivElement;
                          const rect = el.getBoundingClientRect();
                          const clickX = evt.clientX - rect.left;
                          const clickRatio = clickX / rect.width;
                          
                          // 按点击位置比例定位播放（取消左侧25%从头开始的特殊逻辑）
                          const ratio = Math.min(1, Math.max(0, clickRatio));

                          // 设置选中状态
                          onFileSelect(file);

                          // 首次点击时优先用波形播放，避免与 HTMLAudio 双重播放
                          (async () => {
                            // 立即标记为当前播放，用于显示加载态
                            if (playingFile !== file.uid) {
                              setPlayingFile(file.uid);
                            }

                            let audio = audioRefs.get(file.uid);

                            // 如果还没有波形或容器为空，需要创建/重建波形
                            const ctn = waveformContainersRef.current.get(file.uid) || el;
                            let wf = waveformRefs.get(file.uid);
                            if (!wf && ctn) {
                              setLoadingWaveforms(prev => new Set(prev).add(file.uid));
                              const created = await createWaveform(file, ctn);
                              if (created) {
                                wf = created;
                              }
                              setLoadingWaveforms(prev => { const s = new Set(prev); s.delete(file.uid); return s; });
                            }
                            if (wf) {
                              wf.seekTo(ratio);
                              const vol = mutedFiles.has(file.uid) ? 0 : (volumes.get(file.uid) || 1.0);
                              wf.setVolume(vol);
                              wf.play();
                            }

                            const seek = () => {
                              if (!isNaN(audio!.duration) && audio!.duration > 0) {
                                audio!.currentTime = ratio * audio!.duration;
                                const wf = waveformRefs.get(file.uid);
                                if (wf) {
                                  wf.seekTo(ratio);
                                  const vol = mutedFiles.has(file.uid) ? 0 : (volumes.get(file.uid) || 1.0);
                                  wf.setVolume(vol);
                                  wf.play();
                                }
                                // 避免双重播放：只有在没有波形的情况下才播放 audio
                                if (!waveformRefs.get(file.uid)) {
                                  audio!.play().catch(() => {});
                                }
                              }
                            };

                            if (isNaN(audio!.duration) || audio!.duration === Infinity || audio!.duration === 0) {
                              audio!.addEventListener('loadedmetadata', seek, { once: true });
                              audio!.load();
                            } else {
                              seek();
                            }
                          })();
                        }}
                      >
                        {waveformRefs.has(file.uid) ? null : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                            {loadingWaveforms.has(file.uid) ? (
                              <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                <span>加载中...</span>
                              </div>
                            ) : (
                              <span>点击播放</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-end gap-1 ml-2">
                    {/* 控制按钮行 */}
                    <div className="flex items-center gap-1.5">
                      {/* 播放按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playingFile === file.uid) {
                            // 如果正在播放，则暂停
                            handlePlayPause(file, e);
                          }
                        }}
                        className={cn(
                          "p-2 rounded transition-colors",
                          isMidiFile(file.name)
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : playingFile === file.uid
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-secondary text-secondary-foreground hover:bg-accent opacity-50"
                        )}
                        title={isMidiFile(file.name) ? "MIDI文件不支持播放" : (playingFile === file.uid ? "暂停" : "点击item播放")}
                        disabled={isMidiFile(file.name) || playingFile !== file.uid}
                      >
                        {playingFile === file.uid ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      
                      {/* 下载按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFile(file);
                        }}
                        className="p-2 hover:bg-accent rounded transition-colors"
                        title="下载文件"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      
                      {/* 定位按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLocateFile(file.rel_path);
                      }}
                        className="p-2 hover:bg-accent rounded transition-colors"
                      title="在文件浏览器中定位"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>

                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromCollection(file);
                        }}
                        className={cn(
                          "p-2 hover:bg-accent rounded transition-colors",
                          successfulFiles.has(file.uid) && "bg-red-500 text-white hover:bg-red-600"
                        )}
                        title={successfulFiles.has(file.uid) ? "删除成功！" : "从收藏夹删除"}
                        disabled={removingFiles.has(file.uid)}
                      >
                        {removingFiles.has(file.uid) ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        ) : (
                          <Trash2 className={cn(
                            "w-4 h-4",
                            successfulFiles.has(file.uid) && "text-white"
                          )} />
                        )}
                      </button>
                    </div>
                    
                    {/* 音量控制 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMuteToggle(file);
                        }}
                        className="p-2 hover:bg-accent rounded transition-colors"
                        title={isMidiFile(file.name) ? "MIDI文件不支持音量控制" : (mutedFiles.has(file.uid) ? "取消静音" : "静音")}
                        disabled={isMidiFile(file.name)}
                      >
                        {mutedFiles.has(file.uid) ? (
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
                        value={mutedFiles.has(file.uid) ? 0 : (volumes.get(file.uid) || 1.0)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleVolumeChange(file, parseFloat(e.target.value));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="volume-slider w-20"
                        style={{
                          '--volume-percent': `${(mutedFiles.has(file.uid) ? 0 : (volumes.get(file.uid) || 1.0)) * 100}%`
                        } as React.CSSProperties}
                        title={isMidiFile(file.name) ? "MIDI文件不支持音量控制" : "音量"}
                        disabled={isMidiFile(file.name)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* 加载更多/刷新按钮 */}
            {hasMore && !isRandom && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="btn btn-outline"
                >
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
            
            {/* 随机模式下的刷新按钮 */}
            {isRandom && (
              <div className="flex justify-center py-4">
                <button
                  onClick={refreshRandom}
                  disabled={loading}
                  className="btn btn-outline"
                >
                  {loading ? '刷新中...' : '刷新'}
                </button>
          </div>
        )}
      </div>
        )}
      </div>
      
      {/* Tooltip */}
      {tooltip.show && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg max-w-md break-words pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
};

export default CollectionList;
