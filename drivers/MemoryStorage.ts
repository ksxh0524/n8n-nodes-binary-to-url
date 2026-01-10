interface MemoryFile {
	data: Buffer;
	contentType: string;
	uploadedAt: number;
	expiresAt: number;
}

// Simple in-memory storage with TTL
export class MemoryStorage {
	private static cache = new Map<string, MemoryFile>();
	private static readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
	private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100 MB
	private static currentCacheSize = 0;

	static generateFileKey(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 15);
		return `${timestamp}-${random}`;
	}

	static async upload(
		data: Buffer,
		contentType: string,
		ttl?: number
	): Promise<{ fileKey: string; contentType: string }> {
		const fileKey = this.generateFileKey();
		const now = Date.now();
		const expiresAt = now + (ttl || this.DEFAULT_TTL);
		const fileSize = data.length;

		// Check if adding this file would exceed max cache size
		if (this.currentCacheSize + fileSize > this.MAX_CACHE_SIZE) {
			// Clean up expired files first
			this.cleanupExpired();

			// If still too large, remove oldest files
			if (this.currentCacheSize + fileSize > this.MAX_CACHE_SIZE) {
				this.cleanupOldest(fileSize);
			}
		}

		const file: MemoryFile = {
			data,
			contentType,
			uploadedAt: now,
			expiresAt,
		};

		this.cache.set(fileKey, file);
		this.currentCacheSize += fileSize;

		return { fileKey, contentType };
	}

	static async download(fileKey: string): Promise<{ data: Buffer; contentType: string } | null> {
		const file = this.cache.get(fileKey);

		if (!file) {
			return null;
		}

		// Check if expired
		if (Date.now() > file.expiresAt) {
			this.delete(fileKey);
			return null;
		}

		return {
			data: file.data,
			contentType: file.contentType,
		};
	}

	static async delete(fileKey: string): Promise<boolean> {
		const file = this.cache.get(fileKey);
		if (!file) return false;

		this.currentCacheSize -= file.data.length;
		return this.cache.delete(fileKey);
	}

	static cleanupExpired(): void {
		const now = Date.now();
		for (const [key, file] of this.cache.entries()) {
			if (now > file.expiresAt) {
				this.delete(key);
			}
		}
	}

	static cleanupOldest(requiredSpace: number): void {
		const entries = Array.from(this.cache.entries());
		// Sort by upload time (oldest first)
		entries.sort((a, b) => a[1].uploadedAt - b[1].uploadedAt);

		let freedSpace = 0;
		for (const [key, file] of entries) {
			if (freedSpace >= requiredSpace) break;

			freedSpace += file.data.length;
			this.delete(key);
		}
	}

	static getCacheSize(): number {
		return this.currentCacheSize;
	}

	static getCacheCount(): number {
		return this.cache.size;
	}

	static clear(): void {
		this.cache.clear();
		this.currentCacheSize = 0;
	}
}
