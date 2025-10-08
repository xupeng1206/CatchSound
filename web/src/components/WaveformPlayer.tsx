import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '../lib/utils';
import { AudioFile, getAudioStream } from '../api/client';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

interface WaveformPlayerProps {
  file: AudioFile | null;
  isVisible: boolean;
}

const WaveformPlayer: React.FC<WaveformPlayerProps> = ({ file, isVisible }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // 初始化 WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || wavesurferRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#6366f1',
      progressColor: '#4f46e5',
      cursorColor: '#1e40af',
      barWidth: 2,
      barRadius: 3,
      responsive: true,
      height: 100,
      normalize: true,
      backend: 'WebAudio',
      mediaControls: false,
    });

    // 添加区域插件
    const regionsPlugin = RegionsPlugin.create();
    wavesurfer.registerPlugin(regionsPlugin);

    wavesurferRef.current = wavesurfer;

    // 事件监听
    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      setIsLoading(false);
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('seek', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
    });

    wavesurfer.on('pause', () => {
      setIsPlaying(false);
    });

    wavesurfer.on('finish', () => {
      setIsPlaying(false);
      wavesurfer.seekTo(0);
    });

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
  }, []);

  // 加载音频文件
  useEffect(() => {
    if (!file || !wavesurferRef.current) return;

    const loadAudio = async () => {
      try {
        setIsLoading(true);
        
        // 清理之前的音频URL
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        // 获取新的音频流
        const url = await getAudioStream(file.rel_path);
        setAudioUrl(url);
        
        // 加载到 WaveSurfer
        await wavesurferRef.current!.load(url);
      } catch (error) {
        console.error('Failed to load audio:', error);
        setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [file]);

  // 清理资源
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!wavesurferRef.current) return;
    
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
    }
  };

  const handleSeek = (time: number) => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.seekTo(time / duration);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(newVolume);
    }
  };

  const toggleMute = () => {
    if (!wavesurferRef.current) return;
    
    if (isMuted) {
      wavesurferRef.current.setVolume(volume);
      setIsMuted(false);
    } else {
      wavesurferRef.current.setVolume(0);
      setIsMuted(true);
    }
  };

  const skipBackward = () => {
    if (!wavesurferRef.current) return;
    const newTime = Math.max(0, currentTime - 10);
    wavesurferRef.current.seekTo(newTime / duration);
  };

  const skipForward = () => {
    if (!wavesurferRef.current) return;
    const newTime = Math.min(duration, currentTime + 10);
    wavesurferRef.current.seekTo(newTime / duration);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isVisible || !file) return null;

  return (
    <div className="bg-card border-t border-border p-4">
      <div className="max-w-4xl mx-auto">
        {/* 文件信息 */}
        <div className="mb-4">
          <h3 className="font-medium text-lg">{file.name}</h3>
          <p className="text-sm text-muted-foreground">{file.rel_path}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {file.key && <span>调式: {file.key}</span>}
            {file.bpm && <span>BPM: {file.bpm}</span>}
            {file.duration && <span>时长: {formatTime(parseFloat(file.duration))}</span>}
          </div>
        </div>

        {/* 波形图 */}
        <div className="mb-4">
          <div 
            ref={waveformRef}
            className={cn(
              "w-full rounded-lg border bg-background",
              isLoading && "opacity-50"
            )}
          />
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm text-muted-foreground">加载音频中...</span>
            </div>
          )}
        </div>

        {/* 播放控制 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={skipBackward}
              className="p-2 hover:bg-accent rounded transition-colors"
              disabled={isLoading}
            >
              <SkipBack className="w-4 h-4" />
            </button>
            
            <button
              onClick={togglePlayPause}
              className="p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
              disabled={isLoading}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            
            <button
              onClick={skipForward}
              className="p-2 hover:bg-accent rounded transition-colors"
              disabled={isLoading}
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* 时间显示 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* 音量控制 */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 hover:bg-accent rounded transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20"
            />
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-4">
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${(currentTime / duration) * 100}%, #e5e7eb ${(currentTime / duration) * 100}%, #e5e7eb 100%)`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default WaveformPlayer;
