// utils/minio/client.ts
import { S3Client } from "@aws-sdk/client-s3";

// Fail fast on missing config
const REQUIRED_ENV = ["AWS_REGION", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    throw new Error(`Missing required env: ${missingEnv.join(", ")}`);
}

export const BUCKET = process.env.S3_BUCKET_NAME as string;
export const MAX_UPLOAD_BYTES = (parseInt(process.env.MAX_UPLOAD_MB ?? "", 10) || 10) * 1024 * 1024; // Default 10 MB

function buildClient(endpoint?: string) {
    return new S3Client({
        region: process.env.AWS_REGION,
        requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
        // MinIO needs path-style URLs; no endpoint means real AWS S3
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
}

// Server-to-storage traffic
export const storageClient = buildClient(process.env.S3_ENDPOINT);

// Presigned URLs embed the host, so sign with the one the browser can reach
export const signingClient = buildClient(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
