import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class S3Api implements ICredentialType {
	name = 's3Api';

	displayName = 'S3';

	icon: Icon = 'file:../icons/BinaryToUrl.svg';

	documentationUrl = 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/AccessCredentials.html';

	properties: INodeProperties[] = [
		{
			displayName: 'S3 Endpoint',
			name: 'endpoint',
			type: 'string',
			default: '',
			description: 'S3-compatible service endpoint (e.g., https://s3.amazonaws.com, https://minio.example.com)',
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'string',
			default: 'us-east-1',
			description: 'AWS region or custom region for S3-compatible service',
		},
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
		},
		{
			displayName: 'Force Path Style',
			name: 'forcePathStyle',
			type: 'boolean',
			default: false,
			description: 'Use path-style addressing (required for MinIO, DigitalOcean Spaces, etc.)',
		},
	];

	test = {
		request: {
			baseURL: '={{$credentials.endpoint}}',
			url: '=/',
			method: 'GET' as const,
		},
	};
}
