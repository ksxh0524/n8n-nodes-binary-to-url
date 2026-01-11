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

Files are stored in memory and automatically deleted after expiration (TTL).

---

## Features

- **In-Memory Storage** - Store files temporarily in n8n memory
- **Temporary URLs** - Create short-lived URLs for binary data
- **Zero Configuration** - No setup required
- **Automatic Cleanup** - Files expire automatically via TTL
- **Cache Management** - Built-in LRU cache with limits
- **Workflow Isolation** - Each workflow has isolated storage
- **Secure File Keys** - Cryptographically secure file key generation

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

1. Add a **Binary to URL** node to your workflow
2. Connect to a node with binary data (e.g., HTTP Request)
3. Configure:
   - **Binary Property**: `data` (default) - name of binary property containing the file
   - **TTL (Seconds)**: `600` (10 minutes) - how long the file remains accessible
4. Execute the workflow

**Output:**

```json
{
  "fileKey": "1736567890123-a1b2c3d4e5f6g7h8",
  "proxyUrl": "http://127.0.0.1:5678/webhook/xxx/file?fileKey=1736567890123-a1b2c3d4e5f6g7h8",
  "contentType": "image/jpeg",
  "fileSize": 245678
}
```

---

## Usage Examples

### Example 1: Send URL to External API

```
1. HTTP Request (download image)
2. Binary to URL (TTL: 300)
3. HTTP Request (send proxyUrl to external API)
```

### Example 2: Temporary Email Attachment

```
1. Generate PDF report
2. Binary to URL (TTL: 600)
3. Send Email (use proxyUrl as attachment link)
```

### Example 3: Batch Processing

```
1. Read Binary Files
2. Split In Batches
3. Binary to URL (TTL: 300)
4. HTTP Request (send proxyUrl to API)
```

---

## Configuration

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| Binary Property | string | `data` | Name of binary property containing the file to upload |
| TTL (Seconds) | number | `600` | How long the file remains accessible (60-604800 seconds) |

### Storage Limits

| Limit | Value |
|-------|-------|
| Max file size | 100 MB |
| Max cache per workflow | 100 MB |
| Global max cache | 500 MB |
| Min TTL | 60 seconds (1 minute) |
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

## Workflow Requirements

### Active or Public Workflow

The Webhook URL will only work when the workflow is **Active** or **Public**:

- **Active workflow**: Manually activate the workflow in n8n UI
- **Public workflow**: Set as Public (static workflow), no activation needed

The webhook route is registered when the workflow is active or published as public.

### TTL-Based Lifecycle

```
File Upload → URL generated → File accessible for TTL seconds → Auto-deleted → URL returns 404
```

Files are automatically deleted when TTL expires. No manual cleanup required.

---

## Troubleshooting

### Node not visible

1. Check installation: `npm list n8n-nodes-binary-to-url`
2. **Restart n8n** (most common issue)
3. Refresh browser page

### File URL returns 404

- Ensure workflow is **Active** or **Public**
- Check if file expired (TTL passed)
- Verify fileKey is correct
- Try uploading again

### Cache full

- Wait for files to expire (TTL-based)
- Reduce TTL for faster cleanup
- Increase cache size in source code if you have more RAM

### Memory usage high

- Reduce TTL to expire files faster
- Reduce `MAX_CACHE_SIZE` in source code
- Use shorter TTL values

---

## Testing

Create a test workflow:

1. **Manual Trigger** node
2. **HTTP Request** node: GET `https://picsum.photos/200/300`, Response Format: `File`
3. **Binary to URL** node: TTL: 600
4. **Save and activate** the workflow (or set as Public)
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
