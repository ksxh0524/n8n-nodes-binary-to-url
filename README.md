# n8n-nodes-binary-bridge

n8n community node for binary file to public URL bridge with S3 storage.

## Features

- **Upload Mode**: Upload binary files to S3 storage and get public proxy URL
- **Delete Mode**: Delete files from S3 storage
- **Webhook Proxy**: Built-in webhook acts as file stream forwarding server
- **Streaming**: High-performance streaming to avoid memory overflow
- **S3 Compatible**: Supports AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
- **Custom Endpoint**: Configure custom S3 endpoint for S3-compatible services
- **Path Style**: Support both virtual-hosted and path-style addressing

## Installation

```bash
npm install n8n-nodes-binary-bridge
```

## Usage

### Upload Mode

1. Add a **Binary Bridge** node to your workflow
2. Configure AWS S3 credentials
3. Set operation to **Upload**
4. Configure bucket name and region
5. (Optional) Set custom endpoint for S3-compatible services
6. (Optional) Enable force path style if needed
7. Connect a node with binary data to the Binary Bridge node
8. Execute the workflow
9. The node will return:
   - `fileKey`: Unique file identifier
   - `proxyUrl`: Public URL to access the file
   - `contentType`: MIME type of the file

### Delete Mode

1. Add a **Binary Bridge** node to your workflow
2. Configure AWS S3 credentials
3. Set operation to **Delete**
4. Configure bucket name and region
5. Set file key to delete (or use from previous upload)
6. Execute the workflow
7. The node will return:
   - `success`: True if deletion succeeded
   - `deleted`: The file key that was deleted

### Webhook Proxy

The webhook URL is automatically generated and can be used to access uploaded files:

```
https://your-n8n-instance/webhook/{workflowId}/binarybridge/file/{fileKey}
```

The webhook supports:
- **GET** requests to download files
- **Content-Type** header with correct MIME type
- **Cache-Control**: 24-hour cache
- **Content-Disposition**: inline for browser preview

## Architecture

This node implements a **Single-Node Proxy** architecture:
- Handles file upload to S3 storage
- Acts as a webhook server for file streaming
- Creates a data loop without external dependencies
- Uses streaming to avoid memory issues in n8n Cloud

## Technical Details

- **Node Type**: Transform
- **Version**: 1
- **n8n Version**: >= 1.0.0
- **Dependencies**: @aws-sdk/client-s3 (no external dependencies for n8n compatibility)
- **Streaming**: Uses ReadableStream for efficient file handling
- **File Key Generation**: Timestamp + random string for security

## License

MIT

## Repository

https://cnb.cool/ksxh-wwrs/n8n-nodes-binary-bridge
