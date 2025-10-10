import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 音频文件相关接口
export interface AudioFile {
  uid: string;
  abs_path: string;
  rel_path: string;
  name: string;
  ext: string;
  size: string;
  duration: string;
  channels: string;
  bitrate: string;
  bitdepth: string;
  samplerate: string;
  bpm: string;
  year: string;
  key: string;
  oneshot: string;
  tags: string[];
}

export interface SearchParams {
  limit?: number;
  offset?: number;
  path?: string;
  tags?: string[];
  oneshot?: string;
  key?: string;
  op?: 'AND' | 'OR';
  rand?: boolean;
  _refresh?: number; // 刷新时间戳，用于强制重新获取随机数据
}

export interface FileBrowserItem {
  name: string;
  path: string;
  type: 'folder' | 'file';
  subs?: FileBrowserItem[];
  is_current_file?: boolean;
}

// 音频文件搜索
export const searchAudioFiles = async (params: SearchParams): Promise<AudioFile[]> => {
  const response = await api.post('/sounds', params);
  return response.data;
};

// 收藏夹搜索
export const searchCollectionFiles = async (params: SearchParams): Promise<AudioFile[]> => {
  const response = await api.post('/collection', params);
  return response.data;
};

// 添加到收藏夹
export const addToCollection = async (path: string): Promise<void> => {
  await api.post('/collection/add', { path });
};

// 从收藏夹删除
export const removeFromCollection = async (path: string): Promise<void> => {
  await api.post('/collection/remove', { path });
};

// 获取文件夹内容
export const getFolderContents = async (path: string): Promise<FileBrowserItem[]> => {
  const response = await api.post('/tree/folder/content', { path });
  return response.data;
};

// 获取文件分支（用于定位文件）
export const getFileBranch = async (path: string): Promise<FileBrowserItem[]> => {
  const response = await api.post('/tree/file/branch', { path });
  return response.data;
};

// 获取所有可用标签
export const getAvailableTags = async (): Promise<string[]> => {
  const response = await api.post('/tags');
  return response.data;
};

// 获取音频文件流（用于播放）
export const getAudioStream = async (path: string): Promise<string> => {
  const response = await api.get('/file', {
    params: { path },
    responseType: 'blob'
  });
  return URL.createObjectURL(response.data);
};

export default api;
