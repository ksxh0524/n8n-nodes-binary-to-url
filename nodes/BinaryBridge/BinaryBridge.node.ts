import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';
import { Readable } from 'stream';
import { S3Storage, SupabaseStorage } from '../../drivers';

interface StorageDriver {
	uploadStream(stream: Readable, contentType: string, metadata?: Record<string, string>): Promise<{ fileKey: string; contentType: string }>;
	downloadStream(fileKey: string): Promise<{ stream: Readable; contentType: string }>;
	deleteFile(fileKey: string): Promise<void>;
}

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
		description: 'Upload binary files to storage and proxy them via public URL',
		defaults: {
			name: 'Binary Bridge',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'awsS3Api',
				displayName: 'AWS S3 Credentials',
				required: true,
			},
			{
				name: 'supabaseApi',
				displayName: 'Supabase Credentials',
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
				displayName: 'Storage Driver',
				name: 'storageDriver',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'AWS S3',
						value: 's3',
						description: 'Use AWS S3 or S3-compatible storage (Alibaba OSS, Tencent COS, MinIO, etc.)',
					},
					{
						name: 'Supabase',
						value: 'supabase',
						description: 'Use Supabase Storage',
					},
				],
				default: 's3',
			},
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
				displayOptions: {
					show: {
						storageDriver: ['s3'],
					},
				},
				description: 'AWS region',
			},
			{
				displayName: 'Custom Endpoint',
				name: 'endpoint',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						storageDriver: ['s3'],
					},
				},
				description: 'Custom S3 endpoint URL (for S3-compatible services like Alibaba OSS, Tencent COS, MinIO, etc.)',
			},
			{
				displayName: 'Force Path Style',
				name: 'forcePathStyle',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						storageDriver: ['s3'],
					},
				},
				description: 'Use path-style addressing (for MinIO, DigitalOcean Spaces, etc.)',
			},
			{
				displayName: 'Project URL',
				name: 'projectUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						storageDriver: ['supabase'],
					},
				},
				placeholder: 'https://your-project.supabase.co',
				description: 'Supabase project URL',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const bucket = this.getNodeParameter('bucket', 0) as string;
		const region = this.getNodeParameter('region', 0) as string;

		if (!bucket) {
			throw new NodeOperationError(this.getNode(), 'Bucket name is required');
		}

		if (!region) {
			throw new NodeOperationError(this.getNode(), 'Region is required');
		}

		let credentials;
		try {
			credentials = await this.getCredentials('awsS3Api');
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Failed to get S3 credentials: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const accessKeyId = credentials.accessKeyId as string;
		const secretAccessKey = credentials.secretAccessKey as string;

		if (!accessKeyId || !secretAccessKey) {
			throw new NodeOperationError(this.getNode(), 'S3 credentials are incomplete. Please check your AWS credentials');
		}

		const endpoint = this.getNodeParameter('endpoint', 0) as string;
		const forcePathStyle = this.getNodeParameter('forcePathStyle', 0) as boolean;

		const storage = new S3Storage({
			accessKeyId,
			secretAccessKey,
			region,
			bucket,
			endpoint: endpoint || undefined,
			forcePathStyle,
		});

		if (operation === 'upload') {
			return handleUpload(this, items, storage);
		} else if (operation === 'delete') {
			return handleDelete(this, items, storage);
		}

		throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
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
		const region = this.getNodeParameter('region', 0) as string;

		if (!bucket || !region) {
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

		let credentials;
		try {
			credentials = await this.getCredentials('awsS3Api');
		} catch (error) {
			return {
				webhookResponse: {
					status: 500,
					body: JSON.stringify({ error: 'Failed to get S3 credentials' }),
					headers: {
						'Content-Type': 'application/json',
					},
				},
			};
		}

		const accessKeyId = credentials.accessKeyId as string;
		const secretAccessKey = credentials.secretAccessKey as string;

		if (!accessKeyId || !secretAccessKey) {
			return {
				webhookResponse: {
					status: 500,
					body: JSON.stringify({ error: 'S3 credentials are incomplete' }),
					headers: {
						'Content-Type': 'application/json',
					},
				},
			};
		}

		const endpoint = this.getNodeParameter('endpoint', 0) as string;
		const forcePathStyle = this.getNodeParameter('forcePathStyle', 0) as boolean;

		const storage = new S3Storage({
			accessKeyId,
			secretAccessKey,
			region,
			bucket,
			endpoint: endpoint || undefined,
			forcePathStyle,
		});

		try {
			const { stream, contentType } = await storage.downloadStream(fileKey);

			return {
				webhookResponse: {
					status: 200,
					body: stream,
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
	storage: S3Storage,
): Promise<INodeExecutionData[][]> {
	const binaryPropertyName = context.getNodeParameter('binaryPropertyName', 0) as string;
	const webhookBaseUrl = buildWebhookUrl(context, 'default', 'file');

	const returnData: INodeExecutionData[] = [];

	for (const item of items) {
		const binaryData = item.binary?.[binaryPropertyName];

		if (!binaryData) {
			throw new NodeOperationError(
				context.getNode(),
				`No binary data found in property "${binaryPropertyName}"`,
			);
		}

		let contentType = binaryData.mimeType || 'application/octet-stream';

		if (!ALLOWED_MIME_TYPES.includes(contentType)) {
			throw new NodeOperationError(
				context.getNode(),
				`MIME type "${contentType}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
			);
		}

		const fileSize = Buffer.byteLength(binaryData.data, 'base64');
		if (fileSize > MAX_FILE_SIZE) {
			throw new NodeOperationError(
				context.getNode(),
				`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
			);
		}

		const uploadStream = base64ToStream(binaryData.data);

		const result = await storage.uploadStream(uploadStream, contentType);

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
	storage: S3Storage,
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

function base64ToStream(base64: string): Readable {
	const buffer = Buffer.from(base64, 'base64');
	return Readable.from(buffer);
}

function isValidFileKey(fileKey: string): boolean {
	if (!fileKey || typeof fileKey !== 'string') {
		return false;
	}

	const fileKeyPattern = /^[0-9]+-[a-z0-9]+\.[a-z0-9]+$/i;
	return fileKeyPattern.test(fileKey);
}
