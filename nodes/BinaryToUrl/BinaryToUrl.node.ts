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
import {
  TTL,
  CACHE_LIMITS,
  ALLOWED_MIME_TYPES,
  DOWNLOAD_MIME_TYPES,
  HTTP_HEADERS,
} from '../../config/constants.js';

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
    // Initialize logger for MemoryStorage
    MemoryStorage.setLogger(this.logger);
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
      const isDownload = DOWNLOAD_MIME_TYPES.includes(result.contentType);
      const disposition = isDownload
        ? HTTP_HEADERS.DISPOSITION_ATTACHMENT
        : HTTP_HEADERS.DISPOSITION_INLINE;

      response.writeHead(200, {
        'Content-Type': result.contentType,
        'Content-Length': result.data.length,
        'Cache-Control': HTTP_HEADERS.CACHE_CONTROL,
        'Content-Disposition': disposition,
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

/**
 * Generate webhook URL for file downloads
 * @returns Base webhook URL (without query parameters)
 */
function generateWebhookUrl(
  context: IExecuteFunctions,
  workflowId: string
): string {
  const node = context.getNode();
  const baseUrl = context.getInstanceBaseUrl();

  // Get webhook path from n8n
  const webhookPath = getNodeWebhookUrl('', workflowId, node, 'file', false);
  if (!webhookPath) {
    throw new NodeOperationError(
      context.getNode(),
      'Failed to generate webhook path. This is usually caused by:\n' +
      '1. Workflow not saved - Make sure to save the workflow before executing\n' +
      '2. n8n configuration issue - Check that n8n is properly configured\n' +
      '3. Workflow ID is invalid - Try recreating the workflow node'
    );
  }

  // Clean and build URL: remove extra slashes
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const cleanPath = webhookPath.replace(/^\/+/, '');

  const webhookUrl = `${cleanBaseUrl}/webhook/${cleanPath}`;

  // Validate URL format
  if (!webhookUrl.includes('/webhook/')) {
    throw new NodeOperationError(
      context.getNode(),
      `Generated webhook URL has invalid format: ${webhookUrl}\n` +
      `Expected format: ${cleanBaseUrl}/webhook/{path}/file\n` +
      `Please check your n8n version and configuration.`
    );
  }

  return webhookUrl;
}

/**
 * Convert n8n binary data to Buffer
 */
function binaryToBuffer(
  binaryData: { data: Buffer | string | { $binary?: string } },
  mimeType: string,
  context: IExecuteFunctions
): Buffer {
  const data = binaryData.data;

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'string') {
    return Buffer.from(data, 'base64');
  }

  if (data && typeof data === 'object') {
    const binaryValue = (data as { $binary?: string }).$binary || data;
    return Buffer.from(binaryValue as string, 'base64');
  }

  throw new NodeOperationError(
    context.getNode(),
    `Unsupported binary data format: ${typeof data}`
  );
}

async function handleUpload(
  context: IExecuteFunctions,
  items: INodeExecutionData[]
): Promise<INodeExecutionData[][]> {
  // Validate input
  if (!items || items.length === 0) {
    throw new NodeOperationError(
      context.getNode(),
      'No input data provided'
    );
  }

  const binaryPropertyName = context.getNodeParameter('binaryPropertyName', 0) as string;

  if (!binaryPropertyName || binaryPropertyName.trim() === '') {
    throw new NodeOperationError(
      context.getNode(),
      'Binary property name cannot be empty'
    );
  }

  const ttl = context.getNodeParameter('ttl', 0) as number;

  if (ttl < TTL.MIN) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL must be at least ${TTL.MIN} seconds. Got: ${ttl}`
    );
  }
  if (ttl > TTL.MAX) {
    throw new NodeOperationError(
      context.getNode(),
      `TTL cannot exceed ${TTL.MAX} seconds. Got: ${ttl}`
    );
  }

  const workflow = context.getWorkflow();
  const workflowId = workflow.id as string;
  const webhookUrlBase = generateWebhookUrl(context, workflowId);

  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const binaryData = item.binary?.[binaryPropertyName];

    if (!binaryData) {
      throw new NodeOperationError(
        context.getNode(),
        `No binary data found in property "${binaryPropertyName}"`
      );
    }

    // Convert binary data to Buffer
    const buffer = binaryToBuffer(binaryData, binaryData.mimeType || 'application/octet-stream', context);

    const contentType = binaryData.mimeType || 'application/octet-stream';

    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new NodeOperationError(
        context.getNode(),
        `MIME type "${contentType}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }

    const fileSize = buffer.length;
    if (fileSize > CACHE_LIMITS.MAX_FILE_SIZE) {
      throw new NodeOperationError(
        context.getNode(),
        `File size exceeds maximum limit of ${CACHE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    const result = await MemoryStorage.upload(workflowId, buffer, contentType, ttl * 1000);
    const proxyUrl = `${webhookUrlBase}?fileKey=${result.fileKey}`;

    context.logger.info(
      `File uploaded: ${result.fileKey}, size: ${fileSize}, contentType: ${contentType}, ttl: ${ttl}s`
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
  // Format: {timestamp}-{16-char-hex}
  const fileKeyPattern = /^[0-9]+-[a-f0-9]{16}$/i;
  return fileKeyPattern.test(fileKey);
}
