/**
 * Centralized configuration constants for n8n-nodes-binary-to-url
 * All configuration values are defined here to ensure consistency across the codebase
 */

/**
 * TTL (Time To Live) configuration in milliseconds
 */
export const TTL = {
  /** Minimum TTL: 1 minute (60 seconds) */
  MIN: 60,
  /** Maximum TTL: 7 days (604800 seconds) */
  MAX: 604800,
  /** Default TTL: 10 minutes (600 seconds) */
  DEFAULT: 600 * 1000,
} as const;

/**
 * Cache size limits in bytes
 */
export const CACHE_LIMITS = {
  /** Maximum single file size: 100 MB */
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  /** Maximum cache size per workflow: 100 MB */
  MAX_CACHE_SIZE: 100 * 1024 * 1024,
  /** Maximum global cache size across all workflows: 500 MB */
  GLOBAL_MAX_CACHE_SIZE: 500 * 1024 * 1024,
} as const;

/**
 * Cleanup configuration
 */
export const CLEANUP = {
  /** Maximum files to delete in a single cleanup operation */
  MAX_DELETE_PER_CLEANUP: 100,
  /** Minimum number of files to keep in cache even when full */
  MIN_FILES_TO_KEEP: 1,
  /** Size discrepancy threshold (in bytes) for cache validation */
  VALIDATION_THRESHOLD: 1024, // 1 KB
} as const;

/**
 * Allowed MIME types for file uploads
 * Grouped by category for easier maintenance
 */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  // Documents and archives
  'application/pdf',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'text/plain',
  'text/csv',
  'application/json',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * MIME types that should be downloaded (attachment) instead of displayed inline
 * These file types typically trigger browser download behavior
 */
export const DOWNLOAD_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * HTTP headers for file downloads
 */
export const HTTP_HEADERS = {
  /** Cache-Control header value for file downloads */
  CACHE_CONTROL: 'public, max-age=86400', // 24 hours
  /** Content-Disposition for inline viewing */
  DISPOSITION_INLINE: 'inline',
  /** Content-Disposition for download */
  DISPOSITION_ATTACHMENT: 'attachment',
} as const;
