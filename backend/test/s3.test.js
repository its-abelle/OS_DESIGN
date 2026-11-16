import test from "node:test";
import assert from "node:assert";
// Host run: reach MinIO via localhost, not the compose hostname.
process.env.S3_ENDPOINT = "http://localhost:9100";
const { putPdf, presignGet, s3Status, ensureBucket } = await import("../src/s3.js");

await ensureBucket();
const pdf = Buffer.from("%PDF-1.4\nhello\n%%EOF");

test("upload -> presign -> download roundtrip", async () => {
  const key = await putPdf(pdf);
  const res = await fetch(await presignGet(key));
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdf);
});

test("rejects non-PDF content", async () => {
  await assert.rejects(putPdf(Buffer.from("MZ not a pdf")), { status: 400 });
});

test("missing object -> 404", async () => {
  await presignGet("nope.pdf").then(() => assert.fail(), (e) => assert.equal(s3Status(e), 404));
});

test("bucket is private (anonymous GET denied)", async () => {
  const key = await putPdf(pdf);
  const r = await fetch(`http://localhost:9100/${process.env.S3_BUCKET_NAME}/${key}`);
  assert.equal(r.status, 403);
});
