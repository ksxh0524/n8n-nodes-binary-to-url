# Changelog

All notable changes to this project will be documented in this file.

## [0.0.9] - 2026-01-10

### Changed
- **Complete rewrite** - Removed all S3 and external storage dependencies
- **In-memory storage only** - Simplified to use only n8n process memory
- **Zero dependencies** - No external packages required
- **Improved performance** - Direct memory access without network calls
- **Automatic cleanup** - TTL-based expiration with LRU cache eviction

### Removed
- S3 storage support
- S3 API credentials
- All storage driver abstractions
- External storage configuration (Bucket, Region, Endpoint)
- File extension from fileKey (now uses timestamp-random format)

### Added
- Automatic TTL-based file expiration (default: 3600 seconds)
- LRU cache eviction when cache is full (100MB limit)
- Configurable expiration time per upload
- Memory-efficient cache management
- Built-in cleanup of expired and old files

### Fixed
- Webhook URL generation to use only workflow ID
- Memory leaks through proper cache management
- File key validation pattern

## [0.0.8] - 2026-01-10

### Added
- Memory storage option alongside S3
- TTL parameter for memory storage
- Storage type selection (Memory vs S3)
- Display options for conditional parameters

### Changed
- Updated node description to mention memory storage
- Improved parameter organization

## [0.0.7] - 2026-01-10

### Fixed
- Renamed node from "Binary Bridge" to "Binary to URL"
- Fixed credential naming and structure
- Updated webhook URL generation to use workflow ID only

### Changed
- Improved S3 credential configuration
- Better error handling

## [0.0.6] - 2026-01-10

### Refactored
- Restructured project according to n8n official standards
- Removed Supabase storage support
- Rewrote S3 driver without external dependencies
- Implemented AWS Signature V4 manually

### Changed
- Zero external dependencies for n8n Cloud compatibility
- Official n8n build tools and ESLint configuration
