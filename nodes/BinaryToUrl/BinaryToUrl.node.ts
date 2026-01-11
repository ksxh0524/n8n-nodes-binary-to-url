import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  IWebhookFunctions,
  IWebhookResponseData,
  INodeExecutionData,
  NodeOperationError,
  getNodeWebhookUrl,
} from 'n8n-workflow';
import { MemoryStorage } from '../../drivers/MemoryStorage.js';

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
    description: 'Store binary files temporarily in memory and retrieve via webhook URL',
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
        path: 'file',
        isFullPath: false,
      },
    ],
    properties: [
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of binary property containing the file to upload',
      },
      {
        displayName: 'TTL (Seconds)',
        name: 'ttl',
        type: 'number',
        default: 600,
        description: 'How long the file remains accessible (60-604800 seconds, default: 600)',
      },
    ],
    usableAsTool: true,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    return handleUpload(this, this.getInputData());
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const query = this.getQueryData();
    const fileKey = (query as { fileKey?: string }).fileKey;
    const workflow = this.getWorkflow();
    const workflowId = workflow.id as string;

    // Get the native response object
    const response = this.getResponseObject();

    if (!fileKey) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Missing fileKey' }));
      return { noWebhookResponse: true };
    }

    if (!isValidFileKey(fileKey)) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid fileKey' }));
      return { noWebhookResponse: true };
    }

    try {
      const result = await MemoryStorage.download(workflowId, fileKey);

      if (!result) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'File not found or expired' }));
        return { noWebhookResponse: true };
      }

      // Return binary file directly
      response.writeHead(200, {
        'Content-Type': result.contentType,
        'Content-Length': result.data.length,
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': 'inline',
      });
      response.end(result.data);

      return { noWebhookResponse: true };
    } catch (error) {
      this.logger.error(
        `Error downloading file: ${error instanceof Error ? error.message : String(error)}`
      );
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      return { noWebhookResponse: true };
    }
  }
}

async function handleUpload(
  context: IExecuteFunctions,
  items: INodeExecutionData[]
): Promise<INodeExecutionData[][]> {
  const binaryPropertyName = context.getNodeParameter('binaryPropertyName', 0) as string;
  const ttl = context.getNodeParameter('ttl', 0) as number;

  const MIN_TTL = 60;
  const MAX_TTL = 604800;
  if (ttl < MIN_TTL) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL must be at least ${MIN_TTL} seconds. Got: ${ttl}`
    );
  }
  if (ttl > MAX_TTL) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL cannot exceed ${MAX_TTL} seconds. Got: ${ttl}`
    );
  }

  const workflow = context.getWorkflow();
  const workflowId = workflow.id as string;
  const node = context.getNode();
  const baseUrl = context.getInstanceBaseUrl();

  // Remove trailing slash from baseUrl if present
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  // Build webhook URL: /webhook/{webhookId or workflowId}/file
  const webhookPath = getNodeWebhookUrl('', workflowId, node, 'file', false).replace(/^\/+/, '');
  const webhookUrlBase = `${cleanBaseUrl}/webhook/${webhookPath}`;

  // Validate that the webhook URL was generated successfully
  if (!webhookUrlBase || !webhookUrlBase.includes('/webhook/')) {
    throw new NodeOperationError(
      context.getNode(),
      'Failed to generate webhook URL. Please check your n8n configuration.'
    );
  }

  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const binaryData = item.binary?.[binaryPropertyName];

    if (!binaryData) {
      throw new NodeOperationError(
        context.getNode(),
        `No binary data found in property "${binaryPropertyName}"`
      );
    }

    let buffer: Buffer;
    const data = binaryData.data;

    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data, 'base64');
    } else if (data && typeof data === 'object') {
      const binaryValue = (data as { $binary?: string } | Record<string, unknown>).$binary || data;
      buffer = Buffer.from(binaryValue as string, 'base64');
    } else {
      throw new NodeOperationError(
        context.getNode(),
        `Unsupported binary data format: ${typeof data}`
      );
    }

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

    const result = await MemoryStorage.upload(workflowId, buffer, contentType, ttl * 1000);
    const proxyUrl = `${webhookUrlBase}?fileKey=${result.fileKey}`;

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
    });
  }

  return [returnData];
}

function isValidFileKey(fileKey: string): boolean {
  if (!fileKey || typeof fileKey !== 'string') {
    return false;
  }
  const fileKeyPattern = /^[0-9]+-[a-z0-9]+$/i;
  return fileKeyPattern.test(fileKey);
}
