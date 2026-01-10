import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  IWebhookFunctions,
  IWebhookResponseData,
  INodeExecutionData,
  NodeOperationError,
} from 'n8n-workflow';
import { createStorageDriver, StorageDriver } from '../../drivers';

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

export class BinaryBridge implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Binary Bridge',
    name: 'binaryBridge',
    icon: 'file:BinaryBridge.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Upload binary files to S3 storage and proxy them via public URL',
    defaults: {
      name: 'Binary Bridge',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'awsS3',
        displayName: 'S3 Compatible',
        required: true,
      },
      {
        name: 'awsS3Api',
        displayName: 'AWS S3',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'GET',
        responseMode: 'onReceived',
        path: 'file/:fileKey',
        isFullPath: true,
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
            description: 'Upload binary file to storage',
            action: 'Upload file',
          },
          {
            name: 'Delete',
            value: 'delete',
            description: 'Delete file from storage',
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
        displayName: 'File Key',
        name: 'fileKey',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['delete'],
          },
        },
        default: '',
        description: 'Key of the file to delete from storage',
      },
      {
        displayName: 'Bucket',
        name: 'bucket',
        type: 'string',
        default: '',
        required: true,
        description: 'Storage bucket name',
      },
      {
        displayName: 'Region',
        name: 'region',
        type: 'string',
        default: 'us-east-1',
        required: true,
        description: 'AWS region (leave empty for some S3-compatible services)',
      },
      {
        displayName: 'Custom Endpoint',
        name: 'endpoint',
        type: 'string',
        default: '',
        description:
          'Custom S3 endpoint URL (required for MinIO, DigitalOcean Spaces, Wasabi, etc.)',
        displayOptions: {
          show: {
            operation: ['upload', 'delete'],
          },
        },
      },
      {
        displayName: 'Force Path Style',
        name: 'forcePathStyle',
        type: 'boolean',
        default: false,
        description: 'Use path-style addressing (required for MinIO, DigitalOcean Spaces, etc.)',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter('operation', 0) as string;
    const bucket = this.getNodeParameter('bucket', 0) as string;

    if (!bucket) {
      throw new NodeOperationError(this.getNode(), 'Bucket name is required');
    }

    try {
      const storage = await createStorageDriver(this, bucket);

      if (operation === 'upload') {
        return handleUpload(this, items, storage);
      } else if (operation === 'delete') {
        return handleDelete(this, items, storage);
      }

      throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
    } catch (error) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), `Operation failed: ${error.message}`);
      }
      throw new NodeOperationError(this.getNode(), `Operation failed: ${String(error)}`);
    }
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const fileKey = req.params.fileKey as string;

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

    const bucket = this.getNodeParameter('bucket', 0) as string;

    if (!bucket) {
      return {
        webhookResponse: {
          status: 500,
          body: JSON.stringify({ error: 'Node configuration is incomplete' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      };
    }

    let storage;
    try {
      storage = await createStorageDriver(this, bucket);
    } catch (error) {
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

    try {
      const { data, contentType } = await storage.downloadStream(fileKey);

      return {
        webhookResponse: {
          status: 200,
          body: data.toString('base64'),
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Disposition': 'inline',
          },
        },
      };
    } catch (error) {
      return {
        webhookResponse: {
          status: 404,
          body: JSON.stringify({ error: 'File not found' }),
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
  items: INodeExecutionData[],
  storage: StorageDriver
): Promise<INodeExecutionData[][]> {
  const binaryPropertyName = context.getNodeParameter('binaryPropertyName', 0) as string;
  const webhookBaseUrl = buildWebhookUrl(context, 'default', 'file');

  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const binaryData = item.binary?.[binaryPropertyName];

    if (!binaryData) {
      throw new NodeOperationError(
        context.getNode(),
        `No binary data found in property "${binaryPropertyName}"`
      );
    }

    const buffer = Buffer.from(binaryData.data, 'base64');

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

    const result = await storage.uploadStream(buffer, contentType);

    const proxyUrl = `${webhookBaseUrl}/${result.fileKey}`;

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
  items: INodeExecutionData[],
  storage: StorageDriver
): Promise<INodeExecutionData[][]> {
  const returnData: INodeExecutionData[] = [];

  for (const item of items) {
    const fileKey = (item.json.fileKey || context.getNodeParameter('fileKey', 0)) as string;

    if (!fileKey) {
      throw new NodeOperationError(context.getNode(), 'File key is required for delete operation');
    }

    await storage.deleteFile(fileKey);

    returnData.push({
      json: {
        success: true,
        deleted: fileKey,
      },
    });
  }

  return [returnData];
}

function buildWebhookUrl(context: IExecuteFunctions, webhookName: string, path: string): string {
  const baseUrl = context.getInstanceBaseUrl();
  const node = context.getNode();
  const workflow = context.getWorkflow();
  const workflowId = workflow.id;
  const nodeName = encodeURIComponent(node.name.toLowerCase());
  return `${baseUrl}/webhook/${workflowId}/${nodeName}/${path}`;
}

function isValidFileKey(fileKey: string): boolean {
  if (!fileKey || typeof fileKey !== 'string') {
    return false;
  }

  const fileKeyPattern = /^[0-9]+-[a-z0-9]+\.[a-z0-9]+$/i;
  return fileKeyPattern.test(fileKey);
}
