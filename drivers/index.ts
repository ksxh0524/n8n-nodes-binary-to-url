import { S3Storage, StorageConfig as S3StorageConfig } from './S3Storage';
import { MemoryStorage } from './MemoryStorage';
import { IExecuteFunctions, IWebhookFunctions } from 'n8n-workflow';

export { S3Storage } from './S3Storage';
export type { StorageConfig as S3StorageConfig } from './S3Storage';

export interface StorageDriver {
  uploadStream(
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<{ fileKey: string; contentType: string }>;
  downloadStream(fileKey: string): Promise<{ data: Buffer; contentType: string }>;
  deleteFile(fileKey: string): Promise<void>;
}

// Memory storage driver wrapper
class MemoryStorageDriver implements StorageDriver {
	async uploadStream(
		data: Buffer,
		contentType: string,
		metadata?: Record<string, string>
	): Promise<{ fileKey: string; contentType: string }> {
		const ttl = metadata?.ttl ? parseInt(metadata.ttl as string) : undefined;
		return MemoryStorage.upload(data, contentType, ttl);
	}

	async downloadStream(fileKey: string): Promise<{ data: Buffer; contentType: string }> {
		const result = await MemoryStorage.download(fileKey);
		if (!result) {
			throw new Error('File not found or expired');
		}
		return result;
	}

	async deleteFile(fileKey: string): Promise<void> {
		await MemoryStorage.delete(fileKey);
	}
}

export async function createStorageDriver(
  context: IExecuteFunctions | IWebhookFunctions,
  bucket: string
): Promise<StorageDriver> {
  // Get storage type from node parameters
  const storageType = context.getNodeParameter('storageType', 0) as string;

  if (storageType === 'memory') {
    // Use in-memory storage
    return new MemoryStorageDriver();
  }

  // Use S3 storage
  const credentials = await context.getCredentials('s3Api');

  if (!credentials) {
    throw new Error('No S3 credentials found. Please configure S3 credentials.');
  }

  const region = context.getNodeParameter('region', 0) as string;
  const endpoint = context.getNodeParameter('endpoint', 0) as string;
  const forcePathStyle = context.getNodeParameter('forcePathStyle', 0) as boolean;

  // Extract credentials from S3 API credential
  const creds = credentials as Record<string, string>;

  const accessKeyId = creds.accessKeyId || '';
  const secretAccessKey = creds.secretAccessKey || '';
  const credentialEndpoint = creds.endpoint;
  const credentialRegion = creds.region;
  // Convert forcePathStyle from credential (could be string or boolean)
  const credentialForcePathStyle = String(creds.forcePathStyle) === 'true';

  // Use credential values if node parameters are empty
  const finalEndpoint = endpoint || credentialEndpoint;
  const finalRegion = region || credentialRegion || 'us-east-1';
  // Use boolean OR to combine forcePathStyle from node and credential
  const finalForcePathStyle = forcePathStyle || credentialForcePathStyle || false;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Invalid credentials. Missing access key or secret key.');
  }

  // Auto-determine if path style should be forced
  let shouldForcePathStyle = finalForcePathStyle;

  // Force path style by default if custom endpoint is provided
  // This is needed for MinIO, Wasabi, DigitalOcean Spaces, Alibaba OSS, Tencent COS, etc.
  if (finalEndpoint && finalEndpoint !== '' && !finalForcePathStyle) {
    shouldForcePathStyle = true;
  }

  const config: S3StorageConfig = {
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    region: finalRegion,
    bucket,
    endpoint: finalEndpoint || undefined,
    forcePathStyle: shouldForcePathStyle,
  };

  return new S3Storage(config);
}
