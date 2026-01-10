import type {
	Icon,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class S3StorageApi implements ICredentialType {
	name = 's3StorageApi';

	displayName = 'S3 Storage API';

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
	];

	test = {
		request: {
			baseURL: '={{$credentials.endpoint}}',
			url: '=/',
			method: 'GET' as const,
		},
	};
}
