# Binary to URL - n8n Community Node

Create temporary URLs for binary files within n8n workflow execution.

**The simplest way to share binary files in n8n workflows** - No S3, no MinIO, no configuration required. Just install and use!

[![npm version](https://badge.fury.io/js/n8n-nodes-binary-to-url.svg)](https://www.npmjs.com/package/n8n-nodes-binary-to-url)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Video Tutorials

- [YouTube: 告别 S3/MinIO！n8n 史上最简单的 Binary to URL 方案](https://youtu.be/y-YcqSR-fu0)
- [哔哩哔哩: 告别 S3/MinIO！n8n 史上最简单的 Binary to URL 方案](https://www.bilibili.com/video/BV1etrFBbEJp/?vd_source=6485fe2fae664d8b09cb2e2fd7df5ef7)

---

## Use Cases

- **API Callback URLs**: Send temporary file URLs to external APIs for processing
- **Email Attachments**: Include temporary download links in emails
- **Batch Processing**: Convert multiple files to URLs for parallel processing
- **Workflow-Internal Sharing**: Pass binary data between workflow nodes
- **Temporary Preview**: Generate preview URLs for images or documents
- **Testing & Prototyping**: Quick file sharing without setting up storage services

## How It Works

```
Binary Data → Binary to URL Node → Temporary URL → Auto-Deleted after TTL
```

1. Upload binary data to in-memory storage
2. Get a temporary URL (valid for TTL seconds)
3. Share URL with external services or users
4. File automatically deleted when TTL expires

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
  "fileKey": "550e8400-e29b-41d4-a716-446655440000",
  "proxyUrl": "http://127.0.0.1:5678/webhook/xxx/file?fileKey=550e8400-e29b-41d4-a716-446655440000",
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

## Performance Best Practices

### Optimal TTL Settings

| Use Case | Recommended TTL | Reason |
|----------|-----------------|--------|
| Workflow-internal data passing | 60-120s | Fast cleanup, minimal memory usage |
| API callback URLs | 300-600s | Balance between availability and cleanup |
| Email attachments | 600-1800s | Give recipients enough time to access |
| Batch processing | 300-600s | Short enough for cleanup, long enough for processing |

### Memory Optimization Tips

- **Use shorter TTL values** for high-frequency workflows
- **Monitor cache usage** with `getStats()` method in custom code
- **Avoid large files** for temporary use (prefer <10MB when possible)
- **Files auto-expire**: No manual cleanup needed, TTL handles everything

### Concurrency Considerations

- Each workflow has isolated storage (no cross-workflow conflicts)
- Upload operations are serialized per workflow (automatic locking)
- Multiple workflows can upload simultaneously without interference

---

## Security Considerations

### File Key Security

- File keys are generated using `randomUUID()` (cryptographically secure)
- Keys are unpredictable and cannot be guessed
- URLs expire automatically after TTL

### Access Control

- **Workflow-level isolation**: Files are only accessible within the same workflow
- **No authentication required**: URLs are public but temporary
- **No access logging**: Consider adding logging if audit trails are needed

### Best Practices

- **Never store sensitive data**: Use this for temporary files only
- **Use appropriate TTL**: Shorter TTL = lower security risk
- **Monitor usage**: Check cache stats regularly in production

---

## Comparison: Binary to URL vs S3/MinIO

| Feature | Binary to URL | S3/MinIO |
|---------|---------------|----------|
| **Setup** | Zero configuration | Requires server setup |
| **Storage** | In-memory (ephemeral) | Persistent disk storage |
| **Deployment** | Install npm package | Deploy and configure server |
| **Cost** | Free (uses n8n memory) | Server/storage costs |
| **Use Case** | Temporary URLs (minutes-hours) | Long-term file storage |
| **Persistence** | Files expire automatically | Files persist indefinitely |
| **Scalability** | Limited by n8n memory | Highly scalable |
| **Complexity** | Very simple | Complex setup required |
| **Best For** | Workflow-internal temporary sharing | Production file storage |

**When to use Binary to URL:**
- ✅ Temporary file sharing within workflow execution
- ✅ Quick prototyping and testing
- ✅ Simple use cases without long-term storage needs
- ✅ When you don't want to manage external services

**When to use S3/MinIO:**
- ✅ Long-term file storage
- ✅ Production environments with high traffic
- ✅ Files that need to persist beyond workflow execution
- ✅ When you need advanced features (CDN, access control, etc.)

---

## FAQ

### General Questions

**Q: Can I use this for permanent file storage?**
A: No. This node is designed for temporary file sharing only. Files are stored in memory and automatically deleted after TTL expires. For permanent storage, use S3, MinIO, or similar services.

**Q: What happens to files when n8n restarts?**
A: All files are lost because they are stored in memory. This is expected behavior for a temporary storage solution.

**Q: Can multiple workflows access the same file?**
A: No. Each workflow has isolated storage. Files uploaded by one workflow cannot be accessed by another workflow.

**Q: Is there a way to extend the TTL of an existing file?**
A: No. Once uploaded, the TTL is fixed. If you need longer access, upload the file again with a longer TTL.

**Q: What happens if the cache is full?**
A: The oldest files are automatically deleted to make space for new uploads. This is handled by the built-in LRU cache mechanism.

### Technical Questions

**Q: How are file keys generated?**
A: File keys are generated using `randomUUID()`, which provides cryptographically secure random values. This makes keys unpredictable and secure.

**Q: Can I upload files larger than 100 MB?**
A: No. The maximum file size is 100 MB to prevent excessive memory usage. For larger files, consider using S3 or MinIO.

**Q: Does this node work with n8n Cloud?**
A: Yes. The node works with any n8n installation (self-hosted or cloud), but remember that files are stored in memory and will be lost if the instance restarts.

**Q: Can I use this in a production environment?**
A: Yes, but be aware of the limitations:
- Files are stored in memory (limited by n8n's available RAM)
- Files are lost on n8n restart
- No persistence or backup
- Best suited for temporary use cases only

### Integration Questions

**Q: Can I use this with the HTTP Request node?**
A: Yes. You can download files with HTTP Request, then use Binary to URL to create a temporary URL, and finally send that URL to another API.

**Q: Can I use this with the Send Email node?**
A: Yes. Create a temporary URL for your file and include it as a link in your email body.

**Q: Can I use this with the Webhook node?**
A: Yes. You can receive files via Webhook, convert them to URLs, and pass them to other nodes in your workflow.

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
