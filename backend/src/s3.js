import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const { AWS_REGION, S3_BUCKET_NAME: Bucket, S3_ENDPOINT, S3_PUBLIC_ENDPOINT } = process.env;
// Unset endpoints => real AWS S3.
const cfg = (endpoint) => ({
  region: AWS_REGION,
  ...(endpoint && { endpoint, forcePathStyle: true }), // MinIO needs path-style
});
const internal = new S3Client(cfg(S3_ENDPOINT));
// Presigned URLs embed the host, so sign with the browser-reachable one.
const signer = new S3Client(cfg(S3_PUBLIC_ENDPOINT || S3_ENDPOINT));

export const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

export const isPdf = (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

export async function putPdf(buf) {
  if (!isPdf(buf)) throw Object.assign(new Error("not a PDF"), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("too large"), { status: 413 });
  const key = `${randomUUID()}.pdf`;
  await internal.send(new PutObjectCommand({ Bucket, Key: key, Body: buf, ContentType: "application/pdf" }));
  return key;
}

export async function presignGet(key, expiresIn = 60) {
  await internal.send(new HeadObjectCommand({ Bucket, Key: key })); // 404 early if missing
  return getSignedUrl(signer, new GetObjectCommand({ Bucket, Key: key }), { expiresIn });
}

// Map SDK failures to HTTP; never crash the process.
export function s3Status(e) {
  if (e.status) return e.status;
  if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return 404;
  if (["InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"].includes(e.name)) return 502;
  return 503; // network / endpoint down
}

// Create the (private) bucket if absent; retries while MinIO boots. Bucket is private by default.
export async function ensureBucket(tries = 20) {
  for (let i = 0; ; i++) {
    try { return await internal.send(new HeadBucketCommand({ Bucket })); }
    catch (e) {
      if (e.name === "NotFound") return internal.send(new CreateBucketCommand({ Bucket }));
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
