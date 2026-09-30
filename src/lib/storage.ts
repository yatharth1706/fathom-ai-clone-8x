import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let client: S3Client | undefined;

function s3() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });
  return client;
}

export function publicUrl(key: string) {
  return `${env("R2_PUBLIC_BASE_URL").replace(/\/$/, "")}/${key}`;
}

/** Streams a (possibly large) body to R2 using multipart upload. */
export async function putObject(key: string, body: Buffer | Readable | string, contentType: string) {
  await new Upload({
    client: s3(),
    params: { Bucket: env("R2_BUCKET"), Key: key, Body: body, ContentType: contentType },
  }).done();
  return publicUrl(key);
}

/** Presigned PUT for direct browser uploads. Content-Length is signed, so the browser can't exceed it. */
export function presignPut(key: string, contentType: string, contentLength: number, expiresIn = 900) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export async function headObject(key: string) {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
}
