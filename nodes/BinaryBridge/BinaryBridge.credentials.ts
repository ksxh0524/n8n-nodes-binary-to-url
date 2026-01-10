import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class S3Storage implements ICredentialType {
	name = 's3Storage';
	displayName = 'S3 Storage';
	documentationUrl = '';
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
}
