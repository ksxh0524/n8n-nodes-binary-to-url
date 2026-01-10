import { S3Storage, StorageConfig as S3StorageConfig } from './S3Storage';
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

export async function createStorageDriver(
  context: IExecuteFunctions | IWebhookFunctions,
  bucket: string
): Promise<StorageDriver> {
  // Try S3 Compatible credentials first (MinIO, Wasabi, DigitalOcean, Alibaba OSS, Tencent COS, etc.)
  let credentials: any = null;
  let isAwsS3 = false;

  try {
    credentials = await context.getCredentials('awsS3');
    if (credentials) {
      isAwsS3 = false;
    }
  } catch (error) {
    // S3 Compatible credentials not found, try AWS S3
  }

  // If S3 Compatible credentials not found, try AWS S3 API credentials
  if (!credentials) {
    try {
      credentials = await context.getCredentials('awsS3Api');
      if (credentials) {
        isAwsS3 = true;
      }
    } catch (error) {
      // AWS S3 credentials not found
    }
  }

  if (!credentials) {
    throw new Error(
      'No S3 credentials found. Please configure either "S3 Compatible" or "AWS S3" credentials.'
    );
  }

  const region = context.getNodeParameter('region', 0) as string;
  const endpoint = context.getNodeParameter('endpoint', 0) as string;
  const forcePathStyle = context.getNodeParameter('forcePathStyle', 0) as boolean;

  // Extract credentials - different credential types may use different field names
  const accessKeyId = credentials.accessKeyId || credentials.access_key_id;
  const secretAccessKey =
    credentials.secretAccessKey || credentials.secret_access_key || credentials.secret_access_key;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Invalid credentials. Missing access key or secret key.');
  }

  // Auto-determine if path style should be forced
  let shouldForcePathStyle = forcePathStyle;

  // For S3 Compatible services (awsS3), force path style by default if endpoint is provided
  // This is needed for MinIO, Wasabi, DigitalOcean Spaces, Alibaba OSS, Tencent COS, etc.
  if (!isAwsS3) {
    if (endpoint && endpoint !== '') {
      shouldForcePathStyle = true;
    }
  }

  const config: S3StorageConfig = {
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    region: region || 'us-east-1',
    bucket,
    endpoint: endpoint || undefined,
    forcePathStyle: shouldForcePathStyle,
  };

  return new S3Storage(config);
}
