# n8n-nodes-binary-to-url

<div align="center">

**Binary to URL - n8n Community Node**

Create temporary URLs for binary files within workflow execution

[![npm version](https://badge.fury.io/js/n8n-nodes-binary-to-url.svg)](https://www.npmjs.com/package/n8n-nodes-binary-to-url)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## ⚠️ Important Notice

**This node is designed for temporary URL sharing within a workflow execution, NOT for long-term file storage or sharing.**

- ❌ **NOT** a file storage service
- ❌ **NOT** for long-term URL sharing
- ✅ **FOR** temporary URL passing between workflow nodes
- ✅ **FOR** short-term external access (minutes to hours)
- ✅ **FOR** workflow-internal binary data handling

Files are stored in memory and automatically deleted after expiration.

---

## Features

- **In-Memory Storage** - Store files temporarily in n8n memory without any external service
- **Temporary URLs** - Create short-lived URLs for binary data access
- **Zero Configuration** - No setup required, just upload and get URL
- **Automatic Cleanup** - Files expire automatically (default: 10 minutes)
- **Cache Management** - Built-in LRU cache with 100MB limit
- **Workflow-Internal** - Designed for passing binary data between nodes
- **File Type Validation** - Security validation for allowed MIME types
- **Memory Efficient** - Automatic cleanup of expired and old files

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Installation

### Install via npm

```bash
npm install n8n-nodes-binary-to-url
```

### Install in n8n

1. Go to your n8n installation directory
2. Run the npm install command above
3. Restart n8n
4. The "Binary to URL" node will appear in the node palette

---

## Quick Start

### Basic Usage

This node creates temporary URLs for binary data that can be accessed within or outside the workflow.

**Use Case: Pass binary data between nodes**

```yaml
Workflow:
  1. HTTP Request Node (download image)
  2. Binary to URL (create temporary URL)
  3. HTTP Request Node (send URL to another API)
  4. Binary to URL (delete file - optional)
```

**Step-by-step:**

1. Add a **Binary to URL** node to your workflow
2. Select operation **Upload**
3. Set URL expiration time (default: 600 seconds = 10 minutes)
4. Connect any node with binary data (e.g., HTTP Request, Read Binary File)
5. Execute the workflow

**Output:**

```json
{
  "fileKey": "1704801234567-abc123def456",
  "proxyUrl": "https://your-n8n.com/webhook/123/file/1704801234567-abc123def456",
  "contentType": "image/jpeg",
  "fileSize": 245678
}
```

**Use the URL:**

- **Within workflow**: Pass `proxyUrl` to subsequent nodes that need file access
- **External access**: Open `proxyUrl` in browser or API calls (will expire after TTL)

**Note:** The URL is temporary and will stop working after the expiration time.

---

## Configuration

### Operations

#### Upload Operation

| Parameter               | Type   | Required | Default | Description                                         |
| ----------------------- | ------ | -------- | ------- | --------------------------------------------------- |
| **Binary Property**     | string | ❌ No    | `data`  | Name of binary property containing the file         |
| **URL Expiration Time** | number | ❌ No    | `600`   | How long URL remains valid (default: 10 minutes)    |

**Recommended TTL values:**

- **60-300 seconds** (1-5 minutes): For workflow-internal use
- **300-600 seconds** (5-10 minutes): For short-term processing
- **600-3600 seconds** (10-60 minutes): For longer operations (not recommended)

#### Delete Operation

| Parameter    | Type   | Required | Default | Description               |
| ------------ | ------ | -------- | ------- | ------------------------- |
| **File Key** | string | ✅ Yes\* | -       | Key of the file to delete |

\*Can also be provided from previous node via `fileKey` property

### Storage Limits

- **Maximum file size:** 100 MB
- **Maximum cache size:** 100 MB
- **Default TTL:** 600 seconds (10 minutes)
- **Minimum TTL:** 60 seconds (1 minute)

When cache is full, oldest files are automatically removed to make space for new uploads.

---

## Usage Examples

### Example 1: Pass Binary Data Between Nodes

**Scenario:** Download an image, process it with an external API, then delete.

```yaml
Workflow:
  1. HTTP Request (download image from URL A)
  2. Binary to URL (TTL: 300 = 5 minutes)
  3. HTTP Request (send proxyUrl to external API for processing)
  4. Binary to URL (operation: Delete, cleanup)
```

### Example 2: Temporary File for Email Attachment

**Scenario:** Generate a PDF, send via email, then delete.

```yaml
Workflow:
  1. Generate PDF report
  2. Binary to URL (TTL: 600 = 10 minutes)
  3. Send Email (attach using proxyUrl)
  4. Binary to URL (operation: Delete, optional - will auto-expire)
```

⚠️ **Warning:** Email recipients cannot access the file after TTL expires. For email attachments, consider using a proper file storage service.

### Example 3: Batch Processing

**Scenario:** Process multiple files with an external service.

```yaml
Workflow:
  1. Read Binary Files (from folder)
  2. Split In Batches
  3. Binary to URL (TTL: 300 = 5 minutes)
  4. HTTP Request (send to processing API)
  5. Binary to URL (operation: Delete)
```

### Example 4: Temporary Preview URL

**Scenario:** Generate a temporary preview link for a webhook response.

```yaml
Workflow:
  1. Webhook (trigger)
  2. Generate Report
  3. Binary to URL (TTL: 180 = 3 minutes)
  4. Respond to Webhook (include proxyUrl in response)
```

The URL will work for 3 minutes, then automatically expire.

---

## Architecture

### In-Memory Storage Pattern

```
┌─────────────┐      Upload      ┌──────────────┐
│  n8n Node   │ ───────────────► │   Memory     │
│  (Binary    │ ◄─────────────── │   Storage    │
│   to URL)   │    Return URL    │  (n8n RAM)   │
└──────┬──────┘                  └──────────────┘
       │
       │ GET Request (proxy file)
       ▼
┌─────────────────────────────────┐
│  Return file stream to client   │
│  - Content-Type header          │
│  - Cache-Control: 24h           │
│  - Content-Disposition: inline  │
└─────────────────────────────────┘
```

### Key Advantages

- **Zero External Dependencies** - No S3, no database, nothing to configure
- **Fast Performance** - In-memory storage is extremely fast
- **Automatic Cleanup** - Files expire automatically based on TTL
- **LRU Eviction** - Oldest files removed when cache is full
- **Secure File Keys** - Timestamp + random string prevents guessing
- **MIME Type Validation** - White-list of allowed file types for security

---

## API Reference

### Upload Response

```typescript
{
  fileKey: string;      // Unique file identifier
  proxyUrl: string;     // Public URL to access file
  contentType: string;  // MIME type (e.g., "image/jpeg")
  fileSize: number;     // File size in bytes
}
```

### Delete Response

```typescript
{
  success: boolean; // true if deletion succeeded
  deleted: string;  // The file key that was deleted
}
```

### Supported File Types

**Images:**
- JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, AVIF

**Videos:**
- MP4, WebM, MOV, AVI, MKV

**Audio:**
- MP3, WAV, OGG, FLAC

**Documents:**
- PDF, ZIP, RAR, 7Z, TXT, CSV, JSON, XML, XLSX, DOCX

---

## Security

### File Type Validation

Files are validated against a white-list of allowed MIME types based on the provided MIME type from binary data.

### File Key Format

File keys follow the pattern: `{timestamp}-{random}`

Example: `1704801234567-abc123def456`

This prevents unauthorized file enumeration.

### File Size Limits

- **Maximum file size:** 100 MB
- **Maximum total cache:** 100 MB
- Configurable in source code (`MAX_FILE_SIZE` and `MAX_CACHE_SIZE` constants)

### Access Control

The webhook proxy inherits n8n's authentication and access control mechanisms.

### Automatic Expiration

Files are automatically deleted after their TTL expires. The default TTL is 3600 seconds (1 hour), but can be configured per upload.

---

## Troubleshooting

### Common Issues

#### 1. File Returns 404

**Problem:** File not found or expired.

**Solution:**

- Verify the workflow is active (webhooks only work in active workflows)
- Check if the file has expired (TTL has passed)
- Ensure the fileKey is correct
- Try uploading the file again

#### 2. "Cache Full" Warning

**Problem:** Cache is at maximum capacity (100MB).

**Solution:**

- Wait for some files to expire
- Manually delete old files using Delete operation
- Increase `MAX_CACHE_SIZE` in source code if you have more RAM available

#### 3. Files Expire Too Quickly

**Problem:** Default TTL of 3600 seconds (1 hour) is too short.

**Solution:**

- Increase the TTL parameter when uploading (e.g., 86400 for 24 hours)
- Maximum recommended TTL: 604800 seconds (7 days)

#### 4. Memory Usage Too High

**Problem:** n8n process is consuming too much memory.

**Solution:**

- Reduce TTL to expire files faster
- Reduce `MAX_CACHE_SIZE` in source code
- Manually delete files after use instead of relying on auto-expiration

---

## Development

### Project Structure

```
n8n-nodes-binary-to-url/
├── nodes/
│   └── BinaryToUrl/
│       ├── BinaryToUrl.node.ts    # Main node implementation
│       └── BinaryToUrl.svg        # Node icon
├── drivers/
│   ├── index.ts                   # Driver exports
│   └── MemoryStorage.ts           # In-memory storage implementation
├── dist/                          # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Build

```bash
npm install
npm run build
```

### Development

```bash
npm run dev  # Watch mode
```

### Lint & Format

```bash
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix lint issues
npm run format     # Format with Prettier
```

---

## Technical Details

- **Node Type:** Transform
- **Version:** 0.0.9
- **n8n Version:** >= 1.0.0
- **Storage:** In-Memory (n8n process memory)
- **Dependencies:** None (zero external dependencies)

---

## License

[MIT](LICENSE)

---

## Repository

[https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url)

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## Support

- Create an issue in the GitHub repository
- Check the [n8n community forum](https://community.n8n.io)

---

## Changelog

### 0.0.9 (2026-01-10)

- Complete rewrite to use in-memory storage only
- Removed S3 and external storage dependencies
- Zero external dependencies
- Added automatic TTL-based cleanup
- Added LRU cache eviction
- Simplified configuration
- Improved performance with direct memory access
