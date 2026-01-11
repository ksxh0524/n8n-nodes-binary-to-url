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
└──────────────┘                  └──────────────┘
       │
       │ GET Request (webhook)
       ▼
┌─────────────────────────────────┐
│  Return file stream to client   │
│  - Content-Type header          │
│  - Cache-Control: 24h           │
│  - Content-Disposition: inline  │
└─────────────────────────────────┘
```

### Webhook Registration

The node uses **automatic registration** via n8n's webhook system (n8n 2.0+):

1. **Declaration** (via `description.webhooks`)
   - n8n automatically reads webhook configuration
   - Registers when workflow is activated or set as public
   - Config: `httpMethod`, `responseMode`, `path`

2. **Workflow State Requirements**
   - **Active workflow**: Manually activate in n8n UI
   - **Public workflow**: Set as Public (static), no activation needed
   - Webhook route is automatically registered when workflow is active/public
   - Webhook route is automatically unregistered when workflow is deactivated/unpublished

**Note**: This node does not implement manual `webhookMethods` because n8n 2.0's automatic registration is sufficient and recommended. Manual webhook management is only needed for dynamic/advanced use cases.

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
| Node Implementation | `BinaryToUrl.node.ts` | Main node logic, webhook handler |
| Storage Driver | `MemoryStorage.ts` | In-memory storage with TTL & lazy cleanup |
| Helper Functions | `BinaryToUrl.node.ts` | URL generation, binary conversion |

---

## Storage Mechanism

### MemoryStorage Class

```typescript
class MemoryStorage {
  private static workflowCaches = new Map<workflowId, WorkflowCache>();
  private static readonly DEFAULT_TTL = 60 * 60 * 1000;  // 1 hour
  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024;  // 100 MB
  private static readonly GLOBAL_MAX_CACHE_SIZE = 500 * 1024 * 1024;  // 500 MB
  private static nextGlobalExpirationTime?: number;  // Lazy cleanup optimization
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
| TTL Expiration | On access/upload | Remove expired files |
| Lazy Cleanup | Upload when expired | Only cleanup if expiration imminent |
| LRU Eviction (Workflow) | Cache full | Remove oldest files in workflow |
| LRU Eviction (Global) | Global cache full | Remove oldest files across all workflows |

**Optimization**: Uses `nextExpirationTime` tracking to avoid unnecessary full scans.

---

## API Reference

### Node Operation: Upload

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

### Webhook Endpoint

```
GET /webhook/{webhookId}/file?fileKey={fileKey}

Query Parameters:
  - fileKey: The file key returned from upload operation

Response:
  Status 200: File binary content with correct Content-Type
  Status 400: Missing or invalid fileKey
  Status 404: File not found or expired
  Status 500: Server error
```

**Implementation**: Uses `getResponseObject()` to directly send binary data via native HTTP response.

### File Key Format

```
Pattern: {timestamp}-{16-char-hex}
Example: 1736567890123-a1b2c3d4e5f6g7h8
Regex:   /^[0-9]+-[a-f0-9]{16}$/i
```

**Security**: Uses `crypto.randomBytes(8)` for cryptographically secure random generation.

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
- File keys use cryptographically secure random strings
- Cache size protected against negative values

---

## Performance

### Memory Usage

- **Per File**: Original file size + metadata (~100 bytes)
- **Overhead**: JavaScript object overhead (~16-32 bytes per file)

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Upload | O(1) average | O(n) worst case if cleanup needed |
| Download | O(1) | Direct Map.get() with TTL check |
| Cleanup | O(n) | Lazy: only when expiration imminent |

### Optimizations

1. **Lazy Cleanup**: Only scans cache when `nextExpirationTime` is reached
2. **Expiration Tracking**: Each workflow tracks earliest expiration time
3. **Early Exit**: Skip cleanup if expiration time in future
4. **Secure Random**: Uses `crypto.randomBytes()` instead of `Math.random()`

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

### Code Organization

**Helper Functions** (BinaryToUrl.node.ts):

```typescript
generateWebhookUrl(context, workflowId)  // Generate webhook URL
binaryToBuffer(binaryData, mimeType)       // Convert binary data to Buffer
isValidFileKey(fileKey)                   // Validate file key format
```

**MemoryStorage Methods**:

```typescript
static upload(workflowId, data, contentType, ttl)
static download(workflowId, fileKey)
static delete(workflowId, fileKey)
static cleanupWorkflowExpired(workflowId)
static cleanupAllExpired()
static cleanupOldestInWorkflow(workflowId, requiredSpace)
static cleanupOldestGlobal(requiredSpace)
```

### Testing

```bash
# Manual testing workflow:
1. Manual Trigger
2. HTTP Request: GET https://picsum.photos/200/300 (Response: File)
3. Binary to URL: TTL: 600
4. Save and activate workflow (or set as Public)
5. Execute workflow
6. Copy proxyUrl
7. Open in browser or use curl
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
| Package Version | 0.1.10 |
| n8n Version | >= 2.0.0 |
| Storage Type | In-Memory |
| External Dependencies | None (crypto built-in) |
| TypeScript Version | 5.9.2 |

---

## Limitations

- **No persistence**: Files lost on n8n restart
- **Single-instance only**: Cannot share across multiple n8n instances
- **Memory-bound**: Limited by available RAM
- **Workflow isolation**: Files cannot be shared between workflows
- **Active/Public required**: Workflow must be active or public for webhook access

---

## Best Practices

1. **Use appropriate TTL**: Match TTL to your workflow's expected duration
2. **Monitor memory**: Adjust cache limits based on available RAM
3. **Set workflow to Public**: For production use, consider Public workflow instead of Active
4. **Test webhook access**: Always test proxyUrl after workflow activation

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
