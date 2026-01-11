interface MemoryFile {
  data: Buffer;
  contentType: string;
  uploadedAt: number;
  expiresAt: number;
}

interface WorkflowCache {
  cache: Map<string, MemoryFile>;
  cacheSize: number;
}

// Simple in-memory storage with TTL, isolated by workflow ID
export class MemoryStorage {
  private static workflowCaches = new Map<string, WorkflowCache>();
  private static readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100 MB per workflow
  private static readonly GLOBAL_MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500 MB total
  private static globalCacheSize = 0;

  private static getOrCreateWorkflowCache(workflowId: string): WorkflowCache {
    if (!this.workflowCaches.has(workflowId)) {
      this.workflowCaches.set(workflowId, {
        cache: new Map(),
        cacheSize: 0,
      });
    }
    return this.workflowCaches.get(workflowId)!;
  }

  static generateFileKey(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  }

  static async upload(
    workflowId: string,
    data: Buffer,
    contentType: string,
    ttl?: number
  ): Promise<{ fileKey: string; contentType: string }> {
    const fileKey = this.generateFileKey();
    const now = Date.now();
    const expiresAt = now + (ttl || this.DEFAULT_TTL);
    const fileSize = data.length;

    // Check global cache size
    if (this.globalCacheSize + fileSize > this.GLOBAL_MAX_CACHE_SIZE) {
      this.cleanupAllExpired();
      if (this.globalCacheSize + fileSize > this.GLOBAL_MAX_CACHE_SIZE) {
        this.cleanupOldestGlobal(fileSize);
      }
    }

    const workflowCache = this.getOrCreateWorkflowCache(workflowId);

    // Check workflow-specific cache size
    if (workflowCache.cacheSize + fileSize > this.MAX_CACHE_SIZE) {
      this.cleanupWorkflowExpired(workflowId);
      if (workflowCache.cacheSize + fileSize > this.MAX_CACHE_SIZE) {
        this.cleanupOldestInWorkflow(workflowId, fileSize);
      }
    }

    const file: MemoryFile = {
      data,
      contentType,
      uploadedAt: now,
      expiresAt,
    };

    workflowCache.cache.set(fileKey, file);
    workflowCache.cacheSize += fileSize;
    this.globalCacheSize += fileSize;

    return { fileKey, contentType };
  }

  static async download(
    workflowId: string,
    fileKey: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) {
      return null;
    }

    const file = workflowCache.cache.get(fileKey);

    if (!file) {
      return null;
    }

    // Check if expired
    if (Date.now() > file.expiresAt) {
      this.delete(workflowId, fileKey);
      return null;
    }

    return {
      data: file.data,
      contentType: file.contentType,
    };
  }

  static async delete(workflowId: string, fileKey: string): Promise<boolean> {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return false;

    const file = workflowCache.cache.get(fileKey);
    if (!file) return false;

    workflowCache.cacheSize -= file.data.length;
    this.globalCacheSize -= file.data.length;
    return workflowCache.cache.delete(fileKey);
  }

  static cleanupWorkflowExpired(workflowId: string): void {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return;

    const now = Date.now();
    for (const [key, file] of workflowCache.cache.entries()) {
      if (now > file.expiresAt) {
        this.delete(workflowId, key);
      }
    }
  }

  static cleanupAllExpired(): void {
    const now = Date.now();
    for (const [workflowId, workflowCache] of this.workflowCaches.entries()) {
      for (const [key, file] of workflowCache.cache.entries()) {
        if (now > file.expiresAt) {
          this.delete(workflowId, key);
        }
      }
    }
  }

  static cleanupOldestInWorkflow(workflowId: string, requiredSpace: number): void {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return;

    const entries = Array.from(workflowCache.cache.entries());
    // Sort by upload time (oldest first)
    entries.sort((a, b) => a[1].uploadedAt - b[1].uploadedAt);

    let freedSpace = 0;
    for (const [key, file] of entries) {
      if (freedSpace >= requiredSpace) break;

      freedSpace += file.data.length;
      this.delete(workflowId, key);
    }
  }

  static cleanupOldestGlobal(requiredSpace: number): void {
    // Collect all files from all workflows
    const allFiles: Array<{ workflowId: string; fileKey: string; file: MemoryFile }> = [];
    for (const [workflowId, workflowCache] of this.workflowCaches.entries()) {
      for (const [fileKey, file] of workflowCache.cache.entries()) {
        allFiles.push({ workflowId, fileKey, file });
      }
    }

    // Sort by upload time (oldest first)
    allFiles.sort((a, b) => a.file.uploadedAt - b.file.uploadedAt);

    let freedSpace = 0;
    for (const { workflowId, fileKey, file } of allFiles) {
      if (freedSpace >= requiredSpace) break;

      freedSpace += file.data.length;
      this.delete(workflowId, fileKey);
    }
  }

  static getCacheSize(workflowId?: string): number {
    if (workflowId) {
      const workflowCache = this.workflowCaches.get(workflowId);
      return workflowCache?.cacheSize ?? 0;
    }
    return this.globalCacheSize;
  }

  static getCacheCount(workflowId?: string): number {
    if (workflowId) {
      const workflowCache = this.workflowCaches.get(workflowId);
      return workflowCache?.cache.size ?? 0;
    }
    let total = 0;
    for (const workflowCache of this.workflowCaches.values()) {
      total += workflowCache.cache.size;
    }
    return total;
  }

  static clear(workflowId?: string): void {
    if (workflowId) {
      const workflowCache = this.workflowCaches.get(workflowId);
      if (workflowCache) {
        for (const [, file] of workflowCache.cache.entries()) {
          this.globalCacheSize -= file.data.length;
        }
        workflowCache.cache.clear();
        workflowCache.cacheSize = 0;
      }
    } else {
      this.workflowCaches.clear();
      this.globalCacheSize = 0;
    }
  }
}
