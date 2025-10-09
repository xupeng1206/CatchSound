// 串行请求管理器
class SerialRequestManager {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private requestCount = 0;

  async add<T>(request: () => Promise<T>): Promise<T> {
    const requestId = ++this.requestCount;
    console.log(`[RequestManager] 队列请求 #${requestId}，当前队列长度: ${this.queue.length + 1}`);
    
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          console.log(`[RequestManager] 开始执行请求 #${requestId}`);
          const result = await request();
          console.log(`[RequestManager] 请求 #${requestId} 完成`);
          resolve(result);
          return result;
        } catch (error) {
          console.error(`[RequestManager] 请求 #${requestId} 失败:`, error);
          reject(error);
          throw error;
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    console.log(`[RequestManager] 开始处理队列，剩余请求数: ${this.queue.length}`);
    
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error('[RequestManager] 队列处理中请求失败:', error);
        }
      }
      
      // 添加延迟，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isProcessing = false;
    console.log('[RequestManager] 队列处理完成');
  }

  // 获取当前队列状态
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      requestCount: this.requestCount
    };
  }
}

export const requestManager = new SerialRequestManager();
