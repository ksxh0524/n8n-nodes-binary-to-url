import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  IWebhookFunctions,
  IWebhookResponseData,
  INodeExecutionData,
  NodeOperationError,
} from 'n8n-workflow';
import { MemoryStorage } from '../../drivers/MemoryStorage';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'application/pdf',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'text/plain',
  'text/csv',
  'application/json',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export class BinaryToUrl implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Binary to URL',
    name: 'binaryToUrl',
    icon: 'file:BinaryToUrl.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Create temporary URLs for binary files within a workflow execution',
    defaults: {
      name: 'Binary to URL',
    },
    inputs: ['main'],
    outputs: ['main'],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'GET',
        responseMode: 'onReceived',
        path: 'file/:fileKey',
        isFullPath: false,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Upload',
            value: 'upload',
            description: 'Create temporary URL for binary file',
            action: 'Upload file',
          },
          {
            name: 'Delete',
            value: 'delete',
            description: 'Delete file from memory',
            action: 'Delete file',
          },
        ],
        default: 'upload',
      },
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['upload'],
          },
        },
        default: 'data',
        description: 'Name of binary property containing the file to upload',
      },
      {
        displayName: 'URL Expiration Time (Seconds)',
        name: 'ttl',
        type: 'number',
        displayOptions: {
          show: {
            operation: ['upload'],
          },
        },
        default: 600,
        description: 'How long the URL remains valid (default: 600 seconds = 10 minutes)',
        hint: 'This is for temporary use within a workflow. For short-term sharing, use 300-3600 seconds. For workflow-internal use, 60-600 seconds is recommended.',
      },
      {
        displayName: 'File Key',
        name: 'fileKey',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['delete'],
          },
        },
        default: '',
        description: 'Key of the file to delete from memory',
      },
    ],
    usableAsTool: true,
    // Note: When used as a tool, the workflow must be active for webhook file access to work
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter('operation', 0) as string;

    if (operation === 'upload') {
      return handleUpload(this, items);
    } else if (operation === 'delete') {
      return handleDelete(this, items);
    }

    throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const fileKey = req.params.fileKey as string;
    const workflow = this.getWorkflow();
    const workflowId = workflow.id as string;

    if (!fileKey) {
      return {
        webhookResponse: {
          status: 400,
          body: JSON.stringify({ error: 'Missing fileKey' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };
    }

    if (!isValidFileKey(fileKey)) {
      return {
        webhookResponse: {
          status: 400,
          body: JSON.stringify({ error: 'Invalid fileKey' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };
    }

    try {
      const result = await MemoryStorage.download(workflowId, fileKey);

      if (!result) {
        return {
          webhookResponse: {
            status: 404,
            body: JSON.stringify({ error: 'File not found or expired' }),
            headers: {
              'Content-Type': 'application/json',
            },
          },
        };
      }

      return {
        webhookResponse: {
          status: 200,
          body: result.data,
          headers: {
            'Content-Type': result.contentType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Disposition': 'inline',
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Error downloading file: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        webhookResponse: {
          status: 500,
          body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };
    }
  }
}

async function handleUpload(
  context: IExecuteFunctions,
  items: INodeExecutionData[]
): Promise<INodeExecutionData[][]> {
  const binaryPropertyName = context.getNodeParameter('binaryPropertyName', 0) as string;
  const ttl = context.getNodeParameter('ttl', 0) as number;

  // Validate TTL
  const MIN_TTL = 60; // 1 minute
  const MAX_TTL = 604800; // 7 days
  if (ttl < MIN_TTL) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL must be at least ${MIN_TTL} seconds (1 minute). Got: ${ttl}`
    );
  }
  if (ttl > MAX_TTL) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL cannot exceed ${MAX_TTL} seconds (7 days). Got: ${ttl}`
    );
  }

  // Get workflow ID for storage isolation
  const workflow = context.getWorkflow();
  const workflowId = workflow.id as string;

  // Build webhook URL using n8n's instance base URL and workflow ID
  const baseUrl = context.getInstanceBaseUrl();
  const webhookUrl = `${baseUrl}/webhook/${workflowId}/file/:fileKey`;

  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const binaryData = item.binary?.[binaryPropertyName];

    if (!binaryData) {
      throw new NodeOperationError(
        context.getNode(),
        `No binary data found in property "${binaryPropertyName}"`
      );
    }

    // Convert binary data to buffer, handling multiple formats
    let buffer: Buffer;
    const data = binaryData.data;

    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data, 'base64');
    } else if (data && typeof data === 'object') {
      // Handle { $binary: string } format
      const binaryValue = (data as { $binary?: string } | Record<string, unknown>).$binary || data;
      buffer = Buffer.from(binaryValue as string, 'base64');
    } else {
      throw new NodeOperationError(
        context.getNode(),
        `Unsupported binary data format: ${typeof data}`
      );
    }

    // Use provided MIME type or default
    const contentType = binaryData.mimeType || 'application/octet-stream';

    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new NodeOperationError(
        context.getNode(),
        `MIME type "${contentType}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }

    const fileSize = buffer.length;
    if (fileSize > MAX_FILE_SIZE) {
      throw new NodeOperationError(
        context.getNode(),
        `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Upload with workflow isolation
    const result = await MemoryStorage.upload(workflowId, buffer, contentType, ttl * 1000);

    // Replace the :fileKey placeholder with the actual file key
    const proxyUrl = webhookUrl.replace(':fileKey', result.fileKey);

    context.logger.info(
      `File uploaded: ${result.fileKey}, size: ${fileSize}, contentType: ${contentType}, TTL: ${ttl}s`
    );

    returnData.push({
      json: {
        fileKey: result.fileKey,
        proxyUrl,
        contentType,
        fileSize,
      },
      binary: item.binary,
    });
  }

  return [returnData];
}

async function handleDelete(
  context: IExecuteFunctions,
  items: INodeExecutionData[]
): Promise<INodeExecutionData[][]> {
  const workflow = context.getWorkflow();
  const workflowId = workflow.id as string;

  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const fileKey = (item.json.fileKey || context.getNodeParameter('fileKey', 0)) as string;

    if (!fileKey) {
      throw new NodeOperationError(context.getNode(), 'File key is required for delete operation');
    }

    const deleted = await MemoryStorage.delete(workflowId, fileKey);

    if (deleted) {
      context.logger.info(`File deleted: ${fileKey}`);
    } else {
      context.logger.warn(`File not found for deletion: ${fileKey}`);
    }

    returnData.push({
      json: {
        success: deleted,
        deleted: fileKey,
      },
    });
  }

  return [returnData];
}

function isValidFileKey(fileKey: string): boolean {
  if (!fileKey || typeof fileKey !== 'string') {
    return false;
  }

  // Pattern matches: timestamp-random (e.g., 1736567890123-abc123def456)
  const fileKeyPattern = /^[0-9]+-[a-z0-9]+$/i;
  return fileKeyPattern.test(fileKey);
}
