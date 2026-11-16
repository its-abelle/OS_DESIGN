// utils/minio/objects.ts
import { randomUUID } from "node:crypto";
import {
    CopyObjectCommand,
    CreateBucketCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadBucketCommand,
    ListObjectsV2Command,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET, MAX_UPLOAD_BYTES, signingClient, storageClient } from "#utils/minio/client.ts";
import { UserFacingError } from "#utils/server/errors.ts";

export const PRESIGN_SECONDS = 60;
export const DOWNLOAD_GRACE_MS = (PRESIGN_SECONDS + 60) * 1000; // Extra minute so slow downloads can finish

const DOWNLOADED_PREFIX = "downloaded/";
const KEY_PATTERN = /^[0-9a-f-]{36}\.pdf$/;
const NOT_FOUND_ERRORS = ["NoSuchKey", "NotFound"];
const CREDENTIAL_ERRORS = ["InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"];

// Turn storage SDK failures into messages the user can see
function toUserFacing(error: any) {
    if (error instanceof UserFacingError) return error;
    if (NOT_FOUND_ERRORS.includes(error?.name)) return new UserFacingError("File not found", 404);
    if (CREDENTIAL_ERRORS.includes(error?.name)) return new UserFacingError("File storage rejected our credentials", 502);
    if (!error?.$metadata?.httpStatusCode) return new UserFacingError("File storage is unreachable, try again shortly", 503); // Never got a response
    return error;
}

// Create the private bucket if missing (explicit setup step, retries while storage boots)
export async function ensureBucket(attempts = 20) {
    for (let attempt = 1; ; attempt++) {
        try {
            await storageClient.send(new HeadBucketCommand({ Bucket: BUCKET }));
            return;
        } catch (error: any) {
            if (error?.name === "NotFound") {
                await storageClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
                return;
            }
            if (attempt >= attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

export async function uploadPdf(buffer: Buffer) {
    // Check actual content, not the client-sent mime type
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new UserFacingError("Only PDF files are allowed");
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
        throw new UserFacingError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`, 413);
    }

    const key = `${randomUUID()}.pdf`;
    try {
        await storageClient.send(
            new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: "application/pdf" }),
        );
    } catch (error) {
        throw toUserFacing(error);
    }
    return key;
}

// Moves the file out of the live area, then signs a short-lived URL for the moved copy.
// deleteDownloadedFiles removes it once the URL has expired.
export async function getDownloadUrl(key: string) {
    if (!KEY_PATTERN.test(key)) {
        throw new UserFacingError("Invalid file key");
    }
    const downloadedKey = `${DOWNLOADED_PREFIX}${key}`;

    try {
        // 1. Copy to downloaded/ (NoSuchKey if already downloaded or never existed)
        await storageClient.send(
            new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${key}`, Key: downloadedKey }),
        );

        // 2. Remove the live copy so it can't be downloaded twice
        await storageClient.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

        // 3. Sign the moved copy
        return await getSignedUrl(
            signingClient,
            new GetObjectCommand({ Bucket: BUCKET, Key: downloadedKey }),
            { expiresIn: PRESIGN_SECONDS },
        );
    } catch (error) {
        throw toUserFacing(error);
    }
}

// Cleanup: delete downloaded copies older than maxAgeMs. Safe to run from many instances at once.
export async function deleteDownloadedFiles(maxAgeMs = DOWNLOAD_GRACE_MS) {
    const cutoff = Date.now() - maxAgeMs;
    let deletedCount = 0;
    let continuationToken: string | undefined;

    do {
        const page = await storageClient.send(
            new ListObjectsV2Command({ Bucket: BUCKET, Prefix: DOWNLOADED_PREFIX, ContinuationToken: continuationToken }),
        );
        const expired = (page.Contents ?? []).filter((object) => (object.LastModified?.getTime() ?? 0) <= cutoff);

        if (expired.length > 0) {
            await storageClient.send(
                new DeleteObjectsCommand({
                    Bucket: BUCKET,
                    Delete: { Objects: expired.map((object) => ({ Key: object.Key })), Quiet: true },
                }),
            );
            deletedCount += expired.length;
        }
        continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    return deletedCount;
}
