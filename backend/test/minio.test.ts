// test/minio.test.ts
import assert from "node:assert";
import test from "node:test";

// Running on the host, so reach MinIO through the published port
process.env.S3_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT;
const { deleteDownloadedFiles, deleteUploadedPdf, ensureBucket, getDownloadUrl, uploadPdf } = await import("#utils/minio/objects.ts");

const PDF = Buffer.from("%PDF-1.4\nhello\n%%EOF");

await ensureBucket();

test("upload, download, get the same bytes back", async () => {
    const key = await uploadPdf(PDF);
    const response = await fetch(await getDownloadUrl(key));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PDF);
});

test("a file can only be downloaded once", async () => {
    const key = await uploadPdf(PDF);
    await getDownloadUrl(key);
    await assert.rejects(getDownloadUrl(key), { status: 404 });
});

test("cleanup deletes downloaded copies", async () => {
    const url = await getDownloadUrl(await uploadPdf(PDF));
    assert.ok((await deleteDownloadedFiles(0)) >= 1);
    assert.equal((await fetch(url)).status, 404);
});

test("rejects non-PDF content", async () => {
    await assert.rejects(uploadPdf(Buffer.from("MZ not a pdf")), { status: 400 });
});

test("rejects keys outside the expected shape", async () => {
    await assert.rejects(getDownloadUrl("../secrets.pdf"), { status: 400 });
    await assert.rejects(deleteUploadedPdf("../secrets.pdf"), { status: 400 });
});

test("upload rollback deletes only the uploaded object and can be retried", async () => {
    const key = await uploadPdf(PDF);
    await deleteUploadedPdf(key);
    await deleteUploadedPdf(key);
    await assert.rejects(getDownloadUrl(key), { status: 404 });
});

test("bucket is private (anonymous GET denied)", async () => {
    const key = await uploadPdf(PDF);
    const response = await fetch(`${process.env.S3_PUBLIC_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${key}`);
    assert.equal(response.status, 403);
});
