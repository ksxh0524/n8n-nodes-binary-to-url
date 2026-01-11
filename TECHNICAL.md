# Technical Documentation

Architecture, API, and development guide for the Binary to URL n8n node.

---

## Architecture

### Data Flow

```
┌─────────────┐      Upload      ┌──────────────┐
│  n8n Node   │ ───────────────► │   Memory     │
│  (Binary    │ ◄─────────────── │   Storage    │
│   to URL)   │    Return URL    │  (n8n RAM)   │
└──────┬──────┘                  └──────────────┘
       │
       │ GET Request (webhook proxy)
       ▼
┌─────────────────────────────────┐
│  Return file stream to client   │
│  - Content-Type header          │
│  - Cache-Control: 24h           │
│  - Content-Disposition: inline  │
└─────────────────────────────────┘
```

### Storage Model

**Workflow-Isolated In-Memory Storage:**

```
Global Cache (500 MB max)
├── Workflow A (100 MB max)
│   ├── File 1: {data, contentType, expiresAt}
│   └── File 2: {data, contentType, expiresAt}
├── Workflow B (100 MB max)
│   └── File 3: {data, contentType, expiresAt}
└── Workflow C (100 MB max)
    └── File 4: {data, contentType, expiresAt}
```

### Key Components

| Component | File | Description |
|-----------|------|-------------|
| Node Implementation | `BinaryToUrl.node.ts` | Main node logic |
| Storage Driver | `MemoryStorage.ts` | In-memory storage with TTL |
| Webhook Handler | `BinaryToUrl.node.ts` | File download endpoint |

---

## Storage Mechanism

### MemoryStorage Class

```typescript
class MemoryStorage {
  private static workflowCaches = new Map<workflowId, WorkflowCache>();
  private static readonly DEFAULT_TTL = 3600000; // 1 hour
  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100 MB
  private static readonly GLOBAL_MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500 MB
}
```

### File Lifecycle

1. **Upload**: File stored with timestamp and TTL
2. **Access**: Webhook retrieves by `fileKey`
3. **Expiration**: Automatic deletion after TTL
4. **Eviction**: LRU eviction when cache is full

### Cleanup Strategies

| Strategy | Trigger | Behavior |
|----------|---------|----------|
| TTL Expiration | On access/delete | Remove expired files |
| LRU Eviction (Workflow) | Cache full (per workflow) | Remove oldest files in workflow |
| LRU Eviction (Global) | Global cache full | Remove oldest files across all workflows |

---

## API Reference

### Node Operations

#### Upload

```typescript
input: {
  binary: {
    [propertyName]: {
      data: Buffer | string | {$binary: string},
      mimeType: string
    }
  }
}

parameters: {
  binaryPropertyName: string,  // default: "data"
  ttl: number                  // default: 600, min: 60, max: 604800
}

output: {
  fileKey: string,
  proxyUrl: string,
  contentType: string,
  fileSize: number
}
```

#### Delete

```typescript
parameters: {
  fileKey: string  // from input or parameter
}

output: {
  success: boolean,
  deleted: string
}
```

### Webhook Endpoint

```
GET /webhook/{webhookId}/file?fileKey={fileKey}

or (if webhookId is not set):

GET /webhook/{workflowId}/{nodeName}/file?fileKey={fileKey}

Query Parameters:
  - fileKey: The file key returned from upload operation

Response:
  Status 200: File content with correct Content-Type
  Status 400: Missing or invalid fileKey
  Status 404: File not found or expired
  Status 500: Server error
```

**Note:** The webhook URL uses query parameters instead of path parameters. This ensures better compatibility with n8n's webhook registration system.

### File Key Format

```
Pattern: {timestamp}-{random}
Example: 1736567890123-abc123def456
Regex:   /^[0-9]+-[a-z0-9]+$/i
```

---

## Security

### File Type Validation

Files are validated against a whitelist of allowed MIME types:

```typescript
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac',
  'application/pdf', 'application/zip',
  'application/x-rar-compressed', 'application/x-7z-compressed',
  'text/plain', 'text/csv', 'application/json',
  'application/xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
```

### File Size Limits

| Limit | Value | Configurable |
|-------|-------|--------------|
| Max file size | 100 MB | `MAX_FILE_SIZE` constant |
| Max cache per workflow | 100 MB | `MAX_CACHE_SIZE` constant |
| Global max cache | 500 MB | `GLOBAL_MAX_CACHE_SIZE` constant |

### Access Control

- Webhook inherits n8n's authentication
- Files are isolated by workflow ID
- File keys use unguessable random strings

---

## Performance

### Memory Usage

- **Per File**: Original file size + metadata (~100 bytes)
- **Overhead**: JavaScript object overhead (~16-32 bytes per file)

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Upload | O(1) | Direct Map.set() |
| Download | O(1) | Direct Map.get() |
| Delete | O(1) | Direct Map.delete() |
| Cleanup | O(n) | Iterates through cache |

### Optimization Tips

1. **Use appropriate TTL**: Shorter TTL = more frequent cleanup
2. **Delete manually**: Don't rely on auto-expiration for sensitive data
3. **Monitor cache size**: Adjust limits based on available RAM

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
│   └── MemoryStorage.ts           # Storage implementation
├── dist/                          # Compiled output
├── index.ts                       # Package entry point
├── package.json
├── tsconfig.json
└── README.md                      # User documentation
```

### Build Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run lint         # Check code quality
npm run format       # Format with Prettier
```

### Adding New Features

1. **New MIME types**: Add to `ALLOWED_MIME_TYPES` array
2. **Adjust limits**: Modify constants in `BinaryToUrl.node.ts`
3. **Change cleanup strategy**: Modify `MemoryStorage.ts`

### Testing

```bash
# Manual testing workflow:
1. Manual Trigger
2. HTTP Request: GET https://picsum.photos/200/300 (Response: File)
3. Binary to URL: Upload (TTL: 600)
4. Execute workflow
5. Copy proxyUrl
6. Open in browser
```

---

## Configuration Constants

### BinaryToUrl.node.ts

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024;        // 100 MB
const MIN_TTL = 60;                             // 1 minute
const MAX_TTL = 604800;                         // 7 days
```

### MemoryStorage.ts

```typescript
private static readonly DEFAULT_TTL = 60 * 60 * 1000;           // 1 hour
private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024;     // 100 MB
private static readonly GLOBAL_MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500 MB
```

---

## Technical Specifications

| Specification | Value |
|---------------|-------|
| Node Type | Transform |
| Node Version | 1 |
| Package Version | 0.1.0 |
| n8n Version | >= 1.0.0 |
| Storage Type | In-Memory |
| External Dependencies | None |
| TypeScript Version | 5.9.2 |

---

## Limitations

- **No persistence**: Files lost on n8n restart
- **Single-instance only**: Cannot share across multiple n8n instances
- **Memory-bound**: Limited by available RAM
- **Workflow isolation**: Files cannot be shared between workflows

---

## Future Enhancements

Potential improvements for future versions:

1. **Optional persistent storage**: Redis, S3, or filesystem
2. **Multi-instance support**: Shared storage across n8n instances
3. **Compression**: Automatic compression for large files
4. **Encryption**: Optional encryption for sensitive files
5. **Metrics**: Built-in usage statistics and monitoring

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.
