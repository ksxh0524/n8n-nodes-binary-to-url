// Use Node.js crypto in Node environment, Web Crypto API in browser
import * as crypto from 'node:crypto';

declare const window: { crypto: { subtle: WebCryptoSubtle } } | undefined;

interface CryptoKey {
  algorithm: { name: string };
  extractable: boolean;
  usages: string[];
  data: Buffer;
}

interface WebCryptoSubtle {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  importKey(
    format: string,
    keyData: Buffer,
    algorithm: { name: string; hash?: string },
    extractable: boolean,
    usages: string[]
  ): Promise<CryptoKey>;
  sign(algorithm: string, key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer>;
}

interface WebCrypto {
  subtle: WebCryptoSubtle;
}

let cryptoInstance: WebCrypto;

if (typeof window !== 'undefined' && window?.crypto) {
  // Browser environment (n8n Cloud)
  cryptoInstance = window.crypto as unknown as WebCrypto;
} else {
  // Node.js environment
  // Create a Web Crypto API compatible wrapper
  cryptoInstance = {
    subtle: {
      digest: async (algorithm: string, data: Uint8Array): Promise<ArrayBuffer> => {
        const hash = crypto.createHash(algorithm.replace('-', '').toLowerCase());
        hash.update(Buffer.from(data));
        return Buffer.from(hash.digest()).buffer;
      },
      importKey: async (
        format: string,
        keyData: Buffer,
        algorithm: { name: string },
        extractable: boolean,
        usages: string[]
      ): Promise<CryptoKey> => {
        return {
          algorithm,
          extractable,
          usages,
          data: format === 'raw' ? keyData : keyData,
        };
      },
      sign: async (algorithm: string, key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer> => {
        const hmac = crypto.createHmac('sha256', key.data);
        hmac.update(Buffer.from(data));
        return Buffer.from(hmac.digest()).buffer;
      },
    },
  };
}

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
  data: Buffer;
  contentType: string;
}

export class S3Storage {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async uploadStream(
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const fileKey = this.generateFileKey(contentType);
    const endpoint = this.getEndpoint();
    const url = `${endpoint}/${this.config.bucket}/${fileKey}`;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    };

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        headers[`x-amz-meta-${key}`] = value;
      });
    }

    const authorization = await this.generateAuthorization(
      'PUT',
      `/${this.config.bucket}/${fileKey}`,
      headers
    );

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...headers,
          Authorization: authorization,
        },
        body: data,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `S3 upload failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return {
        fileKey,
        contentType,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`S3 upload failed: ${String(error)}`);
    }
  }

  async downloadStream(fileKey: string): Promise<DownloadResult> {
    const endpoint = this.getEndpoint();
    const url = `${endpoint}/${this.config.bucket}/${fileKey}`;

    const authorization = await this.generateAuthorization(
      'GET',
      `/${this.config.bucket}/${fileKey}`,
      {}
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${fileKey}`);
        }
        if (response.status === 403) {
          throw new Error(
            `Access denied to bucket "${this.config.bucket}". Check your credentials`
          );
        }
        throw new Error(`S3 download failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      return {
        data,
        contentType,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`S3 download failed: ${String(error)}`);
    }
  }

  async deleteFile(fileKey: string): Promise<void> {
    const endpoint = this.getEndpoint();
    const url = `${endpoint}/${this.config.bucket}/${fileKey}`;

    const authorization = await this.generateAuthorization(
      'DELETE',
      `/${this.config.bucket}/${fileKey}`,
      {}
    );

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`S3 delete failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`S3 delete failed: ${String(error)}`);
    }
  }

  private getEndpoint(): string {
    if (this.config.endpoint) {
      return this.config.endpoint;
    }

    if (this.config.forcePathStyle) {
      return `https://s3.${this.config.region}.amazonaws.com`;
    }

    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  private async generateAuthorization(
    method: string,
    path: string,
    headers: Record<string, string>
  ): Promise<string> {
    const now = new Date();
    const amzDate = this.getAmzDate(now);
    const dateStamp = this.getDateStamp(now);

    // Canonical request
    const canonicalHeaders = this.getCanonicalHeaders(headers);
    const signedHeaders = this.getSignedHeaders(headers);
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      method,
      path,
      '', // Query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const canonicalRequestHash = await this.sha256(canonicalRequest);

    // String to sign
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join(
      '\n'
    );

    // Calculate signature
    const signingKey = await this.getSigningKey(dateStamp);
    const signature = await this.hmac(signingKey, stringToSign);

    // Authorization header
    return `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  private getAmzDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[:-]|.\d{3}/g, '')
      .replace(/T/, 'T');
  }

  private getDateStamp(date: Date): string {
    return date.toISOString().substring(0, 10).replace(/-/g, '');
  }

  private getCanonicalHeaders(headers: Record<string, string>): string {
    const canonicalHeaders: string[] = [];
    const lowerCaseHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      lowerCaseHeaders[key.toLowerCase()] = value.trim();
    }

    for (const [key, value] of Object.entries(lowerCaseHeaders).sort()) {
      canonicalHeaders.push(`${key}:${value}\n`);
    }

    return canonicalHeaders.join('');
  }

  private getSignedHeaders(headers: Record<string, string>): string {
    const lowerCaseHeaders = Object.keys(headers).map((h) => h.toLowerCase());
    return lowerCaseHeaders.sort().join(';');
  }

  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await cryptoInstance.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmac(key: Buffer, message: string): Promise<string> {
    const cryptoKey = await cryptoInstance.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const signature = await cryptoInstance.subtle.sign('HMAC', cryptoKey, data);
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async getSigningKey(dateStamp: string): Promise<Buffer> {
    const kDate = await this.hmacSha256(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, this.config.region);
    const kService = await this.hmacSha256(kRegion, 's3');
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    return kSigning;
  }

  private async hmacSha256(key: string | Buffer, message: string): Promise<Buffer> {
    const keyBuffer = typeof key === 'string' ? Buffer.from(key) : key;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const cryptoKey = await cryptoInstance.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await cryptoInstance.subtle.sign('HMAC', cryptoKey, data);
    return Buffer.from(signature);
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
