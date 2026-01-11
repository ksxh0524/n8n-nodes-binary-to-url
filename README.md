# Binary to URL - n8n Community Node

Create temporary URLs for binary files within n8n workflow execution.

[![npm version](https://badge.fury.io/js/n8n-nodes-binary-to-url.svg)](https://www.npmjs.com/package/n8n-nodes-binary-to-url)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Important Notice

This node is designed for **temporary URL sharing within workflow execution**, NOT for long-term file storage.

- ❌ NOT a file storage service
- ❌ NOT for long-term URL sharing
- ✅ FOR temporary URL passing between workflow nodes
- ✅ FOR short-term external access (minutes to hours)
- ✅ FOR workflow-internal binary data handling

Files are stored in memory and automatically deleted after expiration.

---

## Features

- **In-Memory Storage** - Store files temporarily in n8n memory
- **Temporary URLs** - Create short-lived URLs for binary data
- **Zero Configuration** - No setup required
- **Automatic Cleanup** - Files expire automatically
- **Cache Management** - Built-in LRU cache with limits
- **Workflow Isolation** - Each workflow has isolated storage

---

## Installation

```bash
npm install n8n-nodes-binary-to-url
```

Then restart n8n:

```bash
# If using npm
n8n restart

# If using Docker
docker-compose restart n8n

# If using systemd
sudo systemctl restart n8n
```

---

## Quick Start

### Upload Operation

1. Add a **Binary to URL** node to your workflow
2. Select **Upload** operation
3. Configure:
   - **Binary Property**: `data` (default)
   - **URL Expiration Time**: `600` (10 minutes)
4. Connect to a node with binary data (e.g., HTTP Request)
5. Execute the workflow

**Output:**

```json
{
  "fileKey": "1736567890123-abc123def456",
  "proxyUrl": "https://your-n8n.com/webhook/webhook-id/file?fileKey=1736567890123-abc123def456",
  "contentType": "image/jpeg",
  "fileSize": 245678
}
```

### Delete Operation

1. Add **Binary to URL** node
2. Select **Delete** operation
3. Enter **File Key** (or use from previous node's `fileKey`)

---

## Usage Examples

### Example 1: Pass Binary Data Between Nodes

```
1. HTTP Request (download image)
2. Binary to URL (Upload, TTL: 300)
3. HTTP Request (send proxyUrl to API)
4. Binary to URL (Delete)
```

### Example 2: Temporary Email Attachment

```
1. Generate PDF report
2. Binary to URL (Upload, TTL: 600)
3. Send Email (use proxyUrl)
4. Binary to URL (Delete)
```

### Example 3: Batch Processing

```
1. Read Binary Files
2. Split In Batches
3. Binary to URL (Upload, TTL: 300)
4. HTTP Request (send to API)
5. Binary to URL (Delete)
```

---

## Configuration

### Upload Operation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| Binary Property | string | `data` | Name of binary property |
| URL Expiration Time | number | `600` | TTL in seconds (60-604800) |

### Delete Operation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| File Key | string | Yes* | Key of file to delete |

*Can be provided from previous node's `fileKey`

### Storage Limits

| Limit | Value |
|-------|-------|
| Max file size | 100 MB |
| Max cache per workflow | 100 MB |
| Global max cache | 500 MB |
| Min TTL | 60 seconds |
| Max TTL | 604800 seconds (7 days) |

### Recommended TTL

- **60-300s** (1-5 min): Workflow-internal use
- **300-600s** (5-10 min): Short-term processing
- **600-3600s** (10-60 min): Longer operations

---

## Supported File Types

| Category | Types |
|----------|-------|
| Images | JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, AVIF |
| Videos | MP4, WebM, MOV, AVI, MKV |
| Audio | MP3, WAV, OGG, FLAC |
| Documents | PDF, ZIP, RAR, 7Z, TXT, CSV, JSON, XML, XLSX, DOCX |

---

## Troubleshooting

### Node not visible

1. Check installation: `npm list n8n-nodes-binary-to-url`
2. **Restart n8n** (most common issue)
3. Refresh browser page

### File URL returns 404

- Ensure workflow is **active** (webhooks only work in active workflows)
- Check if file expired (TTL passed)
- Verify fileKey is correct
- Try uploading again

### Cache full

- Wait for files to expire
- Manually delete old files using Delete operation
- Increase cache size in source code if you have more RAM

### Memory usage high

- Reduce TTL to expire files faster
- Reduce `MAX_CACHE_SIZE` in source code
- Delete files manually after use

---

## Testing

Create a test workflow:

1. **Manual Trigger** node
2. **HTTP Request** node: GET `https://picsum.photos/200/300`, Response Format: `File`
3. **Binary to URL** node: Upload, TTL: 600
4. **Save and activate** the workflow
5. **Execute** and copy the `proxyUrl`
6. **Open in browser** to verify

**Expected result:** Image displays in browser.

---

## Links

- **Technical Documentation**: [TECHNICAL.md](TECHNICAL.md)
- **Repository**: [https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url](https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-to-url)
- **n8n Community**: [https://community.n8n.io](https://community.n8n.io)

---

## License

[MIT](LICENSE)
