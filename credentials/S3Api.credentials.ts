import type {
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class S3Api implements ICredentialType {
	name = 's3Api';

	displayName = 'S3 API';

	icon: Icon = 'file:../icons/BinaryToUrl.svg';

	documentationUrl = 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/AccessCredentials.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'string',
			default: 'us-east-1',
			description: 'AWS region (e.g., us-east-1, eu-west-1)',
		},
		{
			displayName: 'S3 Endpoint',
			name: 's3Api',
			type: 'string',
			default: '',
			placeholder: 'https://s3.amazonaws.com',
			description:
				'S3-compatible service endpoint (required for MinIO, DigitalOcean Spaces, Wasabi, etc.). Leave empty for AWS S3.',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.s3Api}}',
			url: '=/',
			method: 'GET',
		},
	};
}
