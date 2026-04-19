import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";

const isLocal = !!process.env.S3_ENDPOINT;

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "eu-west-1",
  ...(isLocal && {
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
    },
  }),
});

export const BUCKET = process.env.S3_BUCKET ?? "wanderwise";

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    await s3.send(new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${BUCKET}/*` }],
      }),
    }));
  }
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  await ensureBucket();
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export function getObjectUrl(key: string): string {
  if (isLocal) return `${process.env.S3_ENDPOINT}/${BUCKET}/${key}`;
  return `https://${BUCKET}.s3.${process.env.S3_REGION ?? "eu-west-1"}.amazonaws.com/${key}`;
}
