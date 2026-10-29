import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const bucket = () => process.env.S3_BUCKET ?? 'pathway-private';
function client(publicUrl = false) {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: publicUrl
      ? (process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000')
      : (process.env.S3_ENDPOINT ?? 'http://localhost:9000'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'pathway-local',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'pathway-local-secret',
    },
  });
}
export async function storeObject(key: string, data: Buffer, mime: string) {
  const s3 = client();
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: data,
        ContentLength: data.length,
        ContentType: mime,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  } finally {
    s3.destroy();
  }
}
export async function deleteObject(key: string) {
  const s3 = client();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }), {
      abortSignal: AbortSignal.timeout(10000),
    });
  } finally {
    s3.destroy();
  }
}
export async function readObject(key: string) {
  const s3 = client();
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }), {
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!result.Body || !result.ContentLength || result.ContentLength > MAX_FILE_BYTES)
      throw new Error('Object is missing or exceeds the allowed size');
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Object exceeds the allowed size');
    return bytes;
  } finally {
    s3.destroy();
  }
}
export async function downloadUrl(key: string, filename: string) {
  const s3 = client(true);
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: 60 },
    );
  } finally {
    s3.destroy();
  }
}
export async function storageReady() {
  const s3 = client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket() }), {
      abortSignal: AbortSignal.timeout(3000),
    });
  } finally {
    s3.destroy();
  }
}
