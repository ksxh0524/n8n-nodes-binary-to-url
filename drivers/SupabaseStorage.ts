import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

export interface SupabaseConfig {
	projectUrl: string;
	apiKey: string;
	bucket: string;
}

export interface UploadResult {
	fileKey: string;
	contentType: string;
}

export interface DownloadResult {
	stream: Readable;
	contentType: string;
}

export class SupabaseStorage {
	private client: SupabaseClient;
	private bucket: string;

	constructor(config: SupabaseConfig) {
		this.client = createClient(config.projectUrl, config.apiKey);
		this.bucket = config.bucket;
	}

	async uploadStream(
		stream: Readable,
		contentType: string,
		metadata?: Record<string, string>,
	): Promise<UploadResult> {
		const fileKey = this.generateFileKey(contentType);

		try {
			const buffer = await this.streamToBuffer(stream);

			const { data, error } = await this.client.storage
				.from(this.bucket)
				.upload(fileKey, buffer, {
					contentType,
					upsert: false,
					cacheControl: '86400',
					metadata,
				});

			if (error) {
				if (error.message.includes('Bucket not found')) {
					throw new Error(`Supabase bucket "${this.bucket}" does not exist or is not accessible`);
				}
				if (error.message.includes('Permission denied')) {
					throw new Error(`Access denied to Supabase bucket "${this.bucket}". Check your API key and bucket permissions`);
				}
				throw new Error(`Supabase upload failed: ${error.message}`);
			}

			return {
				fileKey,
				contentType,
			};
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Supabase upload failed: ${String(error)}`);
		}
	}

	async downloadStream(fileKey: string): Promise<DownloadResult> {
		try {
			const { data, error } = await this.client.storage.from(this.bucket).download(fileKey);

			if (error) {
				if (error.message.includes('Object not found') || error.message.includes('Not Found')) {
					throw new Error(`File not found: ${fileKey}`);
				}
				if (error.message.includes('Permission denied')) {
					throw new Error(`Access denied to Supabase bucket "${this.bucket}". Check your API key and bucket permissions`);
				}
				throw new Error(`Supabase download failed: ${error.message}`);
			}

			if (!data) {
				throw new Error(`File not found: ${fileKey}`);
			}

			const stream = Readable.from(data);

			const contentType = this.getContentTypeFromKey(fileKey);

			return {
				stream,
				contentType,
			};
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Supabase download failed: ${String(error)}`);
		}
	}

	async deleteFile(fileKey: string): Promise<void> {
		try {
			const { error } = await this.client.storage.from(this.bucket).remove([fileKey]);

			if (error) {
				if (error.message.includes('Object not found')) {
					return;
				}
				if (error.message.includes('Permission denied')) {
					throw new Error(`Access denied to Supabase bucket "${this.bucket}". Check your API key and bucket permissions`);
				}
				throw new Error(`Supabase delete failed: ${error.message}`);
			}
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Supabase delete failed: ${String(error)}`);
		}
	}

	private async streamToBuffer(stream: Readable): Promise<Buffer> {
		const chunks: Buffer[] = [];

		for await (const chunk of stream) {
			chunks.push(chunk as Buffer);
		}

		return Buffer.concat(chunks);
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

	private getContentTypeFromKey(fileKey: string): string {
		const ext = fileKey.split('.').pop()?.toLowerCase() || 'bin';
		const extToMime: Record<string, string> = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			svg: 'image/svg+xml',
			bmp: 'image/bmp',
			tiff: 'image/tiff',
			avif: 'image/avif',
			mp4: 'video/mp4',
			webm: 'video/webm',
			mov: 'video/quicktime',
			avi: 'video/x-msvideo',
			mkv: 'video/x-matroska',
			pdf: 'application/pdf',
			zip: 'application/zip',
			rar: 'application/x-rar-compressed',
			'7z': 'application/x-7z-compressed',
			mp3: 'audio/mpeg',
			wav: 'audio/wav',
			ogg: 'audio/ogg',
			flac: 'audio/flac',
			txt: 'text/plain',
			csv: 'text/csv',
			json: 'application/json',
			xml: 'application/xml',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		};

		return extToMime[ext] || 'application/octet-stream';
	}
}
