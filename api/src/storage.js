import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "./config.js";

// Every object a user owns lives under u/<user id>/, so a key can never point
// into someone else's files as long as it's built here from the user's id.
export const keys = {
  tile: (userId, sha256) => `u/${userId}/tiles/${sha256}`,
  mosaic: (userId, id) => `u/${userId}/mosaics/${id}.png`,
  thumb: (userId, id) => `u/${userId}/mosaics/${id}-thumb`,
};

function client(endpoint) {
  return new S3Client({
    region: config.region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    // Newer SDKs add a CRC32 checksum to PutObject by default. In a presigned URL that
    // would be the checksum of an empty body and every browser upload would fail.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const s3 = client(config.s3.endpoint);          // calls the API makes itself
const signer = client(config.s3.publicEndpoint); // URLs handed to browsers
const Bucket = config.s3.bucket;
const ttl = config.limits.urlTtl;

// The signature covers type and length, so the browser can only upload exactly what it declared.
export const uploadUrl = (Key, ContentType, ContentLength) =>
  getSignedUrl(signer, new PutObjectCommand({ Bucket, Key, ContentType, ContentLength }), {
    expiresIn: ttl, signableHeaders: new Set(["content-type", "content-length"]),
  });

export const downloadUrl = (Key, filename) =>
  getSignedUrl(signer, new GetObjectCommand({
    Bucket, Key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"` } : {}),
  }), { expiresIn: ttl });

// Size of an object, or null if it isn't there (yet).
export async function objectSize(Key) {
  try {
    return (await s3.send(new HeadObjectCommand({ Bucket, Key }))).ContentLength;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return null;
    throw e;
  }
}

export async function deleteObjects(list) {
  for (let i = 0; i < list.length; i += 1000) {
    const Objects = list.slice(i, i + 1000).map((Key) => ({ Key }));
    if (Objects.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects, Quiet: true } }));
  }
}

// Run fn over items with at most `n` in flight.
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
