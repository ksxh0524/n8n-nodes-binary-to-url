import { randomBytes } from 'crypto';

interface MemoryFile {
  data: Buffer;
  contentType: string;
  uploadedAt: number;
  expiresAt: number;
}

interface WorkflowCache {
  cache: Map<string, MemoryFile>;
  cacheSize: number;
  nextExpirationTime?: number;
}

export class MemoryStorage {
  private static workflowCaches = new Map<string, WorkflowCache>();
  private static readonly DEFAULT_TTL = 60 * 60 * 1000;
  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024;
  private static readonly GLOBAL_MAX_CACHE_SIZE = 500 * 1024 * 1024;
  private static globalCacheSize = 0;
  private static nextGlobalExpirationTime?: number;
  private static cleanupInterval?: NodeJS.Timeout;
  private static readonly MAX_DELETE_PER_CLEANUP = 100; // Prevent excessive deletion

  private static getOrCreateWorkflowCache(workflowId: string): WorkflowCache {
    if (!this.workflowCaches.has(workflowId)) {
      this.workflowCaches.set(workflowId, {
        cache: new Map(),
        cacheSize: 0,
      });
    }
    return this.workflowCaches.get(workflowId)!;
  }

  /**
   * Generate a cryptographically secure file key
   * Format: {timestamp}-{16-char-hex}
   */
  static generateFileKey(): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
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

    // Lazy cleanup: only trigger if expiration is imminent
    if (this.nextGlobalExpirationTime && now >= this.nextGlobalExpirationTime) {
      this.cleanupAllExpired();
    }

    if (this.globalCacheSize + fileSize > this.GLOBAL_MAX_CACHE_SIZE) {
      this.cleanupAllExpired();
      if (this.globalCacheSize + fileSize > this.GLOBAL_MAX_CACHE_SIZE) {
        this.cleanupOldestGlobal(fileSize);
      }
    }

    const workflowCache = this.getOrCreateWorkflowCache(workflowId);

    // Lazy cleanup for workflow
    if (workflowCache.nextExpirationTime && now >= workflowCache.nextExpirationTime) {
      this.cleanupWorkflowExpired(workflowId);
    }

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

    // Check if fileKey already exists (very unlikely but handle it)
    const existingFile = workflowCache.cache.get(fileKey);
    if (existingFile) {
      // Subtract old file size before replacing
      workflowCache.cacheSize = Math.max(0, workflowCache.cacheSize - existingFile.data.length);
      this.globalCacheSize = Math.max(0, this.globalCacheSize - existingFile.data.length);
    }

    workflowCache.cache.set(fileKey, file);
    workflowCache.cacheSize += fileSize;
    this.globalCacheSize += fileSize;

    // Update next expiration times
    if (!workflowCache.nextExpirationTime || expiresAt < workflowCache.nextExpirationTime) {
      workflowCache.nextExpirationTime = expiresAt;
    }
    if (!this.nextGlobalExpirationTime || expiresAt < this.nextGlobalExpirationTime) {
      this.nextGlobalExpirationTime = expiresAt;
    }

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

    // Prevent negative cache size
    workflowCache.cacheSize = Math.max(0, workflowCache.cacheSize - file.data.length);
    this.globalCacheSize = Math.max(0, this.globalCacheSize - file.data.length);

    const deleted = workflowCache.cache.delete(fileKey);

    // Update next expiration time if needed
    if (deleted && workflowCache.cache.size === 0) {
      workflowCache.nextExpirationTime = undefined;
    } else if (deleted) {
      // Find the earliest expiration time
      let minExpiration = Infinity;
      for (const [, f] of workflowCache.cache.entries()) {
        if (f.expiresAt < minExpiration) {
          minExpiration = f.expiresAt;
        }
      }
      workflowCache.nextExpirationTime = minExpiration === Infinity ? undefined : minExpiration;
    }

    return deleted;
  }

  static cleanupWorkflowExpired(workflowId: string): void {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return;

    // Skip cleanup if no files or next expiration is in the future
    if (workflowCache.cache.size === 0) return;
    if (workflowCache.nextExpirationTime && Date.now() < workflowCache.nextExpirationTime) {
      return;
    }

    const now = Date.now();
    let hasDeleted = false;

    for (const [key, file] of workflowCache.cache.entries()) {
      if (now > file.expiresAt) {
        this.delete(workflowId, key);
        hasDeleted = true;
      }
    }

    // Update next expiration time after cleanup
    if (hasDeleted && workflowCache.cache.size > 0) {
      let minExpiration = Infinity;
      for (const [, f] of workflowCache.cache.entries()) {
        if (f.expiresAt < minExpiration) {
          minExpiration = f.expiresAt;
        }
      }
      workflowCache.nextExpirationTime = minExpiration === Infinity ? undefined : minExpiration;
    } else if (workflowCache.cache.size === 0) {
      workflowCache.nextExpirationTime = undefined;
    }
  }

  static cleanupAllExpired(): void {
    const now = Date.now();

    // Skip cleanup if next expiration is in the future
    if (this.nextGlobalExpirationTime && now < this.nextGlobalExpirationTime) {
      return;
    }

    for (const [workflowId, workflowCache] of this.workflowCaches.entries()) {
      // Skip workflow if its next expiration is in the future
      if (workflowCache.nextExpirationTime && now < workflowCache.nextExpirationTime) {
        continue;
      }

      for (const [key, file] of workflowCache.cache.entries()) {
        if (now > file.expiresAt) {
          this.delete(workflowId, key);
        }
      }
    }

    // Update global next expiration time
    if (this.workflowCaches.size > 0) {
      let minExpiration = Infinity;
      for (const workflowCache of this.workflowCaches.values()) {
        if (workflowCache.nextExpirationTime && workflowCache.nextExpirationTime < minExpiration) {
          minExpiration = workflowCache.nextExpirationTime;
        }
      }
      this.nextGlobalExpirationTime = minExpiration === Infinity ? undefined : minExpiration;
    } else {
      this.nextGlobalExpirationTime = undefined;
    }
  }

  static cleanupOldestInWorkflow(workflowId: string, requiredSpace: number): void {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return;

    const entries = Array.from(workflowCache.cache.entries());
    entries.sort((a, b) => a[1].uploadedAt - b[1].uploadedAt);

    let freedSpace = 0;
    let deletedCount = 0;

    for (const [key, file] of entries) {
      // Stop if we freed enough space or hit max delete limit
      if (freedSpace >= requiredSpace || deletedCount >= this.MAX_DELETE_PER_CLEANUP) {
        break;
      }

      freedSpace += file.data.length;
      this.delete(workflowId, key);
      deletedCount++;
    }

    // Log warning if we couldn't free enough space
    if (freedSpace < requiredSpace && deletedCount < entries.length) {
      console.warn(
        `[MemoryStorage] Hit max delete limit (${this.MAX_DELETE_PER_CLEANUP}) ` +
        `but still need ${requiredSpace - freedSpace} bytes for workflow ${workflowId}`
      );
    }
  }

  static cleanupOldestGlobal(requiredSpace: number): void {
    const allFiles: Array<{ workflowId: string; fileKey: string; file: MemoryFile }> = [];
    for (const [workflowId, workflowCache] of this.workflowCaches.entries()) {
      for (const [fileKey, file] of workflowCache.cache.entries()) {
        allFiles.push({ workflowId, fileKey, file });
      }
    }

    allFiles.sort((a, b) => a.file.uploadedAt - b.file.uploadedAt);

    let freedSpace = 0;
    let deletedCount = 0;

    for (const { workflowId, fileKey, file } of allFiles) {
      // Stop if we freed enough space or hit max delete limit
      if (freedSpace >= requiredSpace || deletedCount >= this.MAX_DELETE_PER_CLEANUP) {
        break;
      }

      freedSpace += file.data.length;
      this.delete(workflowId, fileKey);
      deletedCount++;
    }

    // Log warning if we couldn't free enough space
    if (freedSpace < requiredSpace && deletedCount < allFiles.length) {
      console.warn(
        `[MemoryStorage] Hit max delete limit (${this.MAX_DELETE_PER_CLEANUP}) ` +
        `but still need ${requiredSpace - freedSpace} bytes globally`
      );
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
          this.globalCacheSize = Math.max(0, this.globalCacheSize - file.data.length);
        }
        workflowCache.cache.clear();
        workflowCache.cacheSize = 0;
        workflowCache.nextExpirationTime = undefined;
      }
    } else {
      for (const [, workflowCache] of this.workflowCaches.entries()) {
        workflowCache.nextExpirationTime = undefined;
      }
      this.workflowCaches.clear();
      this.globalCacheSize = 0;
      this.nextGlobalExpirationTime = undefined;
    }
  }
}
