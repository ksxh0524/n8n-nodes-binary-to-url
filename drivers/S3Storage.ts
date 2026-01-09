import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface StorageConfig {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	bucket: string;
	endpoint?: string;
	forcePathStyle?: boolean;
}

export interface UploadResult {
	fileKey: string;
	contentType: string;
}

export interface DownloadResult {
	stream: Readable;
	contentType: string;
}

export class S3Storage {
	private s3Client: S3Client;
	private bucket: string;

	constructor(config: StorageConfig) {
		this.s3Client = new S3Client({
			region: config.region,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
			endpoint: config.endpoint,
			forcePathStyle: config.forcePathStyle ?? false,
		});
		this.bucket = config.bucket;
	}

	async uploadStream(
		stream: Readable,
		contentType: string,
		metadata?: Record<string, string>,
	): Promise<UploadResult> {
		const fileKey = this.generateFileKey(contentType);

		try {
			const command = new PutObjectCommand({
				Bucket: this.bucket,
				Key: fileKey,
				Body: stream,
				ContentType: contentType,
				Metadata: metadata || {},
			});

			await this.s3Client.send(command);

			return {
				fileKey,
				contentType,
			};
		} catch (error) {
			if (error instanceof S3ServiceException) {
				if (error.name === 'NoSuchBucket') {
					throw new Error(`S3 bucket "${this.bucket}" does not exist or is not accessible`);
				}
				if (error.name === 'AccessDenied') {
					throw new Error(`Access denied to S3 bucket "${this.bucket}". Check your credentials and bucket permissions`);
				}
				throw new Error(`S3 upload failed: ${error.message}`);
			}
			throw error;
		}
	}

	async downloadStream(fileKey: string): Promise<DownloadResult> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucket,
				Key: fileKey,
			});

			const response = await this.s3Client.send(command);

			if (!response.Body) {
				throw new Error(`File not found: ${fileKey}`);
			}

			const body = response.Body as any;
			const stream = body instanceof Readable ? body : Readable.from(response.Body as any);

			return {
				stream,
				contentType: response.ContentType || 'application/octet-stream',
			};
		} catch (error) {
			if (error instanceof S3ServiceException) {
				if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
					throw new Error(`File not found: ${fileKey}`);
				}
				if (error.name === 'AccessDenied') {
					throw new Error(`Access denied to S3 bucket "${this.bucket}". Check your credentials and bucket permissions`);
				}
				throw new Error(`S3 download failed: ${error.message}`);
			}
			throw error;
		}
	}

	async deleteFile(fileKey: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.bucket,
			Key: fileKey,
		});

		await this.s3Client.send(command);
	}

	private generateFileKey(contentType: string): string {
		const ext = this.getExtensionFromMimeType(contentType);
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 15);
		return `${timestamp}-${random}${ext}`;
	}

	private getExtensionFromMimeType(mimeType: string): string {
		const mimeToExt: Record<string, string> = {
			'image/jpeg': '.jpg',
			'image/png': '.png',
			'image/gif': '.gif',
			'image/webp': '.webp',
			'image/svg+xml': '.svg',
			'image/bmp': '.bmp',
			'image/tiff': '.tiff',
			'image/avif': '.avif',
			'video/mp4': '.mp4',
			'video/webm': '.webm',
			'video/quicktime': '.mov',
			'video/x-msvideo': '.avi',
			'video/x-matroska': '.mkv',
			'application/pdf': '.pdf',
			'application/zip': '.zip',
			'application/x-rar-compressed': '.rar',
			'application/x-7z-compressed': '.7z',
			'audio/mpeg': '.mp3',
			'audio/wav': '.wav',
			'audio/ogg': '.ogg',
			'audio/flac': '.flac',
			'text/plain': '.txt',
			'text/csv': '.csv',
			'application/json': '.json',
			'application/xml': '.xml',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
		};

		return mimeToExt[mimeType] || '.bin';
	}
}
