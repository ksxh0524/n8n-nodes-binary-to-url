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
import { S3Storage } from '../../drivers';

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
				description: 'S3 bucket name',
			},
			{
				displayName: 'Region',
				name: 'region',
				type: 'string',
				default: 'us-east-1',
				required: true,
				description: 'AWS region',
			},
			{
				displayName: 'Custom Endpoint',
				name: 'endpoint',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				default: '',
				description: 'Custom S3 endpoint URL (for S3-compatible services)',
			},
			{
				displayName: 'Force Path Style',
				name: 'forcePathStyle',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				default: false,
				description: 'Use path-style addressing (for MinIO, DigitalOcean Spaces, etc.)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const bucket = this.getNodeParameter('bucket', 0) as string;
		const region = this.getNodeParameter('region', 0) as string;

		const credentials = await this.getCredentials('awsS3Api');
		const accessKeyId = credentials.accessKeyId as string;
		const secretAccessKey = credentials.secretAccessKey as string;

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

		const bucket = this.getNodeParameter('bucket', 0) as string;
		const region = this.getNodeParameter('region', 0) as string;

		const credentials = await this.getCredentials('awsS3Api');
		const accessKeyId = credentials.accessKeyId as string;
		const secretAccessKey = credentials.secretAccessKey as string;

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
	const webhookUrl = buildWebhookUrl(context, 'default', 'file/:fileKey');

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

		const uploadStream = base64ToStream(binaryData.data);

		const result = await storage.uploadStream(uploadStream, contentType);

		const proxyUrl = `${webhookUrl}/${result.fileKey}`;

		returnData.push({
			json: {
				fileKey: result.fileKey,
				proxyUrl,
				contentType,
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
