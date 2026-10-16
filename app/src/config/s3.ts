import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  // SDK v3 otherwise bakes x-amz-checksum-crc32=AAAAAA== into presigned PUTs.
  // The browser then uploads a real body and S3 returns SignatureDoesNotMatch.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export async function generatePresignedUploadUrl(params: {
  s3Key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  // Do not sign ServerSideEncryption or checksum headers. If they are signed,
  // the browser PUT must send the exact same headers or S3 rejects the
  // signature. New objects still encrypt with the bucket default (SSE-KMS).
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: params.s3Key,
    ContentType: params.contentType,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds || env.S3_PRESIGNED_EXPIRATION_SECONDS,
    unhoistableHeaders: new Set([
      'x-amz-checksum-crc32',
      'x-amz-checksum-crc32c',
      'x-amz-sdk-checksum-algorithm',
      'x-amz-server-side-encryption',
    ]),
  });
}

export async function generatePresignedDownloadUrl(params: {
  s3Key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: params.s3Key,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds || env.S3_PRESIGNED_EXPIRATION_SECONDS,
  });
}
