import { randomBytes } from 'crypto';
import type { Logger } from 'n8n-workflow';
import { TTL, CACHE_LIMITS, CLEANUP } from '../config/constants.js';

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
  expirationQueue: Array<{ fileKey: string; expiresAt: number }>; // Sorted by expiration time
}

interface StorageStats {
  workflowCount: number;
  totalFiles: number;
  totalCacheSize: number;
  workflowFiles?: number;
  workflowCacheSize?: number;
}

export class MemoryStorage {
  private static workflowCaches = new Map<string, WorkflowCache>();
  private static readonly DEFAULT_TTL = TTL.DEFAULT;
  private static readonly MAX_CACHE_SIZE = CACHE_LIMITS.MAX_CACHE_SIZE;
  private static readonly GLOBAL_MAX_CACHE_SIZE = CACHE_LIMITS.GLOBAL_MAX_CACHE_SIZE;
  private static globalCacheSize = 0;
  private static nextGlobalExpirationTime?: number;
  private static cleanupInterval?: NodeJS.Timeout;
  private static readonly MAX_DELETE_PER_CLEANUP = CLEANUP.MAX_DELETE_PER_CLEANUP;
  private static readonly MIN_FILES_TO_KEEP = CLEANUP.MIN_FILES_TO_KEEP;
  private static readonly VALIDATION_THRESHOLD = CLEANUP.VALIDATION_THRESHOLD;
  private static logger?: Logger; // Optional logger for warnings

  // Concurrency control: per-workflow upload locks
  private static uploadLocks = new Map<string, Promise<{ fileKey: string; contentType: string }>>();

  /**
   * Set logger instance for MemoryStorage warnings
   */
  static setLogger(logger: Logger): void {
    this.logger = logger;
  }

  private static warn(message: string): void {
    if (this.logger) {
      this.logger.warn(message);
    } else {
      console.warn(`[MemoryStorage] ${message}`);
    }
  }

  private static getOrCreateWorkflowCache(workflowId: string): WorkflowCache {
    if (!this.workflowCaches.has(workflowId)) {
      this.workflowCaches.set(workflowId, {
        cache: new Map(),
        cacheSize: 0,
        expirationQueue: [],
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
    // Wait for any existing upload for this workflow to complete
    const existingLock = this.uploadLocks.get(workflowId);
    if (existingLock) {
      try {
        return await existingLock;
      } catch (error) {
        // If existing lock failed, remove it and continue
        this.uploadLocks.delete(workflowId);
      }
    }

    // Create new lock for this upload
    const lockPromise = (async () => {
      try {
        return await this.uploadInternal(workflowId, data, contentType, ttl);
      } finally {
        // Release lock
        this.uploadLocks.delete(workflowId);
      }
    })();

    this.uploadLocks.set(workflowId, lockPromise);
    return lockPromise;
  }

  private static async uploadInternal(
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

      // Remove from expiration queue
      const queueIndex = workflowCache.expirationQueue.findIndex(e => e.fileKey === fileKey);
      if (queueIndex !== -1) {
        workflowCache.expirationQueue.splice(queueIndex, 1);
      }
    }

    workflowCache.cache.set(fileKey, file);
    workflowCache.cacheSize += fileSize;
    this.globalCacheSize += fileSize;

    // Add to expiration queue using binary search insertion (O(log n) + O(n) splice)
    const entry = { fileKey, expiresAt };
    let insertIndex = workflowCache.expirationQueue.length;
    let left = 0;
    let right = workflowCache.expirationQueue.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (workflowCache.expirationQueue[mid].expiresAt <= expiresAt) {
        left = mid + 1;
      } else {
        right = mid - 1;
        insertIndex = mid;
      }
    }

    workflowCache.expirationQueue.splice(insertIndex, 0, entry);

    // Update next expiration times (O(1) - just get first element)
    workflowCache.nextExpirationTime = workflowCache.expirationQueue[0]?.expiresAt;
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

    if (deleted) {
      // Remove from expiration queue
      const queueIndex = workflowCache.expirationQueue.findIndex(e => e.fileKey === fileKey);
      if (queueIndex !== -1) {
        workflowCache.expirationQueue.splice(queueIndex, 1);
      }

      // Update next expiration time (O(1) - just get first element)
      if (workflowCache.cache.size === 0) {
        workflowCache.nextExpirationTime = undefined;
        workflowCache.expirationQueue = [];
      } else {
        workflowCache.nextExpirationTime = workflowCache.expirationQueue[0]?.expiresAt;
      }
    }

    return deleted;
  }

  static cleanupWorkflowExpired(workflowId: string): void {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return;

    // Skip cleanup if no files
    if (workflowCache.cache.size === 0) return;

    // Skip if next expiration is in the future
    if (workflowCache.nextExpirationTime && Date.now() < workflowCache.nextExpirationTime) {
      return;
    }

    const now = Date.now();

    // Remove expired files from the front of the queue (it's sorted by expiration time)
    while (workflowCache.expirationQueue.length > 0) {
      const { fileKey, expiresAt } = workflowCache.expirationQueue[0];
      if (now <= expiresAt) {
        // Reached non-expired files, stop cleanup
        break;
      }
      this.delete(workflowId, fileKey);
    }
  }

  static cleanupAllExpired(): void {
    const now = Date.now();

    // Skip cleanup if next expiration is in the future
    if (this.nextGlobalExpirationTime && now < this.nextGlobalExpirationTime) {
      return;
    }

    // Collect expired files first, then delete to avoid race conditions
    const expiredFiles: Array<{ workflowId: string; fileKey: string }> = [];
    let minExpiration = Infinity;

    for (const [workflowId, workflowCache] of this.workflowCaches.entries()) {
      // Track this workflow's next expiration for global min calculation
      if (workflowCache.nextExpirationTime && workflowCache.nextExpirationTime < minExpiration) {
        minExpiration = workflowCache.nextExpirationTime;
      }

      // Skip workflow if its next expiration is in the future
      if (workflowCache.nextExpirationTime && now < workflowCache.nextExpirationTime) {
        continue;
      }

      // Count expired files using index tracking (more efficient than shift)
      let expiredCount = 0;
      while (expiredCount < workflowCache.expirationQueue.length) {
        const { fileKey, expiresAt } = workflowCache.expirationQueue[expiredCount];
        if (now <= expiresAt) {
          break;
        }
        expiredFiles.push({ workflowId, fileKey });
        expiredCount++;
      }

      // Remove all expired files at once using splice (O(n) vs O(n²) with multiple shifts)
      if (expiredCount > 0) {
        workflowCache.expirationQueue.splice(0, expiredCount);
      }

      // Update workflow's next expiration time
      if (workflowCache.cache.size > 0) {
        workflowCache.nextExpirationTime = workflowCache.expirationQueue[0]?.expiresAt;
        if (workflowCache.nextExpirationTime < minExpiration) {
          minExpiration = workflowCache.nextExpirationTime;
        }
      } else {
        workflowCache.nextExpirationTime = undefined;
      }
    }

    // Delete collected expired files
    for (const { workflowId, fileKey } of expiredFiles) {
      this.delete(workflowId, fileKey);
    }

    // Update global next expiration time (calculated during first loop)
    this.nextGlobalExpirationTime = minExpiration === Infinity ? undefined : minExpiration;
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

      // Always keep at least MIN_FILES_TO_KEEP files
      const remainingFiles = entries.length - deletedCount;
      if (remainingFiles <= this.MIN_FILES_TO_KEEP) {
        break;
      }

      freedSpace += file.data.length;
      this.delete(workflowId, key);
      deletedCount++;
    }

    // Log warning if we couldn't free enough space
    if (freedSpace < requiredSpace && deletedCount < entries.length - this.MIN_FILES_TO_KEEP) {
      this.warn(
        `Could not free enough space for workflow ${workflowId}. ` +
        `Needed: ${requiredSpace} bytes, freed: ${freedSpace} bytes. ` +
        `Keeping ${this.MIN_FILES_TO_KEEP} files as minimum.`
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
      this.warn(
        `Hit max delete limit (${this.MAX_DELETE_PER_CLEANUP}) ` +
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
        workflowCache.expirationQueue = [];
        workflowCache.cacheSize = 0;
        workflowCache.nextExpirationTime = undefined;
      }
      // Clear upload lock for this workflow to prevent memory leaks
      this.uploadLocks.delete(workflowId);
    } else {
      for (const [, workflowCache] of this.workflowCaches.entries()) {
        workflowCache.expirationQueue = [];
        workflowCache.nextExpirationTime = undefined;
      }
      this.workflowCaches.clear();
      // Clear all upload locks
      this.uploadLocks.clear();
      this.globalCacheSize = 0;
      this.nextGlobalExpirationTime = undefined;
    }
  }

  /**
   * Validate and correct cache size inconsistencies
   *
   * This helps recover from potential bugs that cause cacheSize to drift.
   *
   * **Usage Note**: This method iterates through all files in the workflow cache (O(n)).
   * Call only when cache size inconsistency is suspected, not on every operation.
   * Recommended usage:
   * - After manual cache modifications
   * - When investigating memory issues
   * - Periodic health checks (e.g., once per hour)
   *
   * @param workflowId - The workflow ID to validate
   * @returns true if correction was made, false otherwise
   */
  static validateCacheSize(workflowId: string): boolean {
    const workflowCache = this.workflowCaches.get(workflowId);
    if (!workflowCache) return false;

    let actualSize = 0;
    for (const [, file] of workflowCache.cache.entries()) {
      actualSize += file.data.length;
    }

    // If discrepancy exceeds threshold, warn and correct
    if (Math.abs(workflowCache.cacheSize - actualSize) > this.VALIDATION_THRESHOLD) {
      this.warn(
        `Cache size mismatch for workflow ${workflowId}: ` +
        `recorded=${workflowCache.cacheSize}, actual=${actualSize}. Correcting...`
      );
      workflowCache.cacheSize = actualSize;

      // Also recalculate global cache size
      let globalActual = 0;
      for (const wc of this.workflowCaches.values()) {
        for (const [, file] of wc.cache.entries()) {
          globalActual += file.data.length;
        }
      }
      if (Math.abs(this.globalCacheSize - globalActual) > this.VALIDATION_THRESHOLD) {
        this.warn(
          `Global cache size mismatch: ` +
          `recorded=${this.globalCacheSize}, actual=${globalActual}. Correcting...`
        );
        this.globalCacheSize = globalActual;
      }

      return true;
    }

    return false;
  }

  /**
   * Get storage statistics
   */
  static getStats(workflowId?: string): StorageStats {
    const stats: StorageStats = {
      workflowCount: this.workflowCaches.size,
      totalFiles: 0,
      totalCacheSize: this.globalCacheSize,
    };

    for (const workflowCache of this.workflowCaches.values()) {
      stats.totalFiles += workflowCache.cache.size;
    }

    if (workflowId) {
      const workflowCache = this.workflowCaches.get(workflowId);
      stats.workflowFiles = workflowCache?.cache.size ?? 0;
      stats.workflowCacheSize = workflowCache?.cacheSize ?? 0;
    }

    return stats;
  }
}
