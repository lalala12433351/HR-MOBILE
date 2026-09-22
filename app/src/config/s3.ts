import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

export const s3Client = new S3Client({
  region: env.AWS_REGION,
});

export async function generatePresignedUploadUrl(params: {
  s3Key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: params.s3Key,
    ContentType: params.contentType,
    ServerSideEncryption: 'aws:kms',
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds || env.S3_PRESIGNED_EXPIRATION_SECONDS,
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
