import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import session from "express-session";
import { createApp, handleErrors } from "../src/app.ts";
import { createAddFile } from "../src/routes/files/post.ts";
import { createDownloadFile } from "../src/routes/files/download.ts";
import type { DownloadStorage } from "../src/routes/files/download.ts";
import type { UploadStorage } from "../src/routes/files/post.ts";
import type { FileRepository, NewFile } from "../src/routes/files/repository.ts";
import { UserFacingError } from "../src/utils/server/errors.ts";

const user = { id: 42, username: "metadata-user", email: "metadata@example.com" };
const otherUser = { id: 43, username: "other-user", email: "other@example.com" };
const createdAt = new Date("2026-11-16T00:00:00Z");
const pdf = Buffer.from("%PDF-1.4\nmetadata test\n%%EOF");
const records: NewFile[] = [];
const objects = new Map<string, Buffer>();
const uploadedKeys: string[] = [];
const deletedKeys: string[] = [];
const downloadCalls: string[] = [];
const ownershipLookups: { key: string; userId: number }[] = [];
const errorLog = mock.method(console, "error", () => {});
let failMetadata = false;
let failUpload = false;
let failRollback = false;
let insertCalls = 0;
let uploadCalls = 0;
let failOwnershipLookup = false;
let downloadError: Error | undefined;

const files: FileRepository = {
    async create(file) {
        insertCalls++;
        if (failMetadata) throw new Error("Private database error details");
        records.push(file);
        return { ...file, id: records.length, createdAt };
    },
    async isOwnedBy(key, userId) {
        ownershipLookups.push({ key, userId });
        if (failOwnershipLookup) throw new Error("Private database lookup details");
        return records.some((file) => file.key === key && file.uploadedBy === userId);
    },
};
const downloads: DownloadStorage = {
    presignSeconds: 60,
    async getDownloadUrl(key) {
        downloadCalls.push(key);
        if (downloadError) throw downloadError;
        if (!objects.has(key)) throw new UserFacingError("File not found", 404);
        objects.delete(key);
        return `https://storage.example/downloaded/${key}?signature=test`;
    },
};
const storage: UploadStorage = {
    maxUploadBytes: 512,
    async uploadPdf(buffer) {
        uploadCalls++;
        if (failUpload) throw new UserFacingError("File storage is unreachable, try again shortly", 503);
        const key = `${randomUUID()}.pdf`;
        uploadedKeys.push(key);
        objects.set(key, Buffer.from(buffer));
        return key;
    },
    async deleteUploadedPdf(key) {
        deletedKeys.push(key);
        if (failRollback) throw new Error("Storage cleanup unavailable");
        objects.delete(key);
    },
};

let server: Server;
let baseUrl: string;
let cookie: string;
let otherCookie: string;
const store = new session.MemoryStore();

before(async () => {
    const app = createApp({
        async create(username) { return username === otherUser.username ? otherUser : user; },
        async findByEmail() { return undefined; },
        async findById(id) { return [user, otherUser].find((account) => account.id === id); },
    }, store, "test-secret-that-is-at-least-32-characters");
    app.post("/api/files", createAddFile(files, storage));
    app.get("/api/files/:key/download", createDownloadFile(files, downloads));
    app.use(handleErrors);
    server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve(listener));
        listener.on("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...user, password: "metadata-test-password" }),
    });
    assert.equal(registration.status, 201);
    cookie = registration.headers.get("set-cookie")!.split(";")[0]!;
    const otherRegistration = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...otherUser, password: "metadata-test-password" }),
    });
    assert.equal(otherRegistration.status, 201);
    otherCookie = otherRegistration.headers.get("set-cookie")!.split(";")[0]!;
});

beforeEach(() => {
    records.length = uploadedKeys.length = deletedKeys.length = 0;
    downloadCalls.length = ownershipLookups.length = 0;
    objects.clear();
    failMetadata = failUpload = failRollback = false;
    failOwnershipLookup = false;
    downloadError = undefined;
    insertCalls = uploadCalls = 0;
    errorLog.mock.resetCalls();
});

after(async () => {
    mock.restoreAll();
    store.clear();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function multipart(buffer = pdf, field = "file") {
    const form = new FormData();
    // The persisted type must come from server-side validation, not this client type.
    form.append(field, new Blob([buffer], { type: "text/plain" }), "lecture.pdf");
    return form;
}

async function upload(form: FormData, authenticated = true) {
    return fetch(`${baseUrl}/api/files`, {
        method: "POST", headers: authenticated ? { Cookie: cookie } : {}, body: form,
    });
}

test("upload persists metadata using the authenticated uploader and actual file size", async () => {
    const form = multipart();
    form.append("uploadedBy", "999");
    form.append("sizeBytes", "1");
    form.append("mimeType", "text/plain");
    const response = await upload(form);
    assert.equal(response.status, 201);
    const expected = {
        key: uploadedKeys[0]!, originalFilename: "lecture.pdf", mimeType: "application/pdf" as const,
        sizeBytes: pdf.length, uploadedBy: user.id,
    };
    assert.deepEqual(records, [expected]);
    assert.deepEqual(await response.json(), { ...expected, id: 1, createdAt: createdAt.toISOString() });
    assert.deepEqual(objects.get(expected.key), pdf);
    assert.equal(deletedKeys.length, 0);
});

test("missing files and unexpected multipart fields do not create objects or metadata", async () => {
    assert.equal((await upload(new FormData())).status, 400);
    assert.equal((await upload(multipart(pdf, "attachment"))).status, 400);
    assert.equal(uploadCalls, 0);
    assert.equal(insertCalls, 0);
});

test("oversized uploads are rejected before storage or database writes", async () => {
    assert.equal((await upload(multipart(Buffer.alloc(storage.maxUploadBytes + 1)))).status, 413);
    assert.equal(uploadCalls, 0);
    assert.equal(insertCalls, 0);
});

test("anonymous uploads cannot create objects or metadata", async () => {
    assert.equal((await upload(multipart(), false)).status, 401);
    assert.equal(uploadCalls, 0);
    assert.equal(insertCalls, 0);
});

test("storage failure does not insert file metadata", async () => {
    failUpload = true;
    const response = await upload(multipart());
    assert.equal(response.status, 503);
    assert.equal(insertCalls, 0);
    assert.equal(deletedKeys.length, 0);
    assert.equal(objects.size, 0);
});

test("metadata insertion failure rolls back the uploaded object and returns no success", async () => {
    failMetadata = true;
    const response = await upload(multipart());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to upload file" });
    assert.equal(insertCalls, 1);
    assert.equal(records.length, 0);
    assert.deepEqual(deletedKeys, uploadedKeys);
    assert.equal(deletedKeys.length, 1);
    assert.equal(objects.size, 0);
});

test("cleanup failure still returns a failed upload and records the orphan key for recovery", async () => {
    failMetadata = failRollback = true;
    const response = await upload(multipart());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to upload file" });
    assert.equal(records.length, 0);
    assert.deepEqual(deletedKeys, uploadedKeys);
    assert.equal(objects.size, 1);
    assert.ok(errorLog.mock.calls.some((call) => call.arguments[1]?.key === uploadedKeys[0]));
});

test("another user cannot obtain a download URL or consume the owner's PDF", async () => {
    const uploaded = await upload(multipart());
    assert.equal(uploaded.status, 201);
    const file = await uploaded.json();
    const denied = await fetch(`${baseUrl}/api/files/${file.key}/download?uploadedBy=${user.id}&userId=${user.id}`, {
        headers: { Cookie: otherCookie },
    });
    assert.equal(denied.status, 404);
    assert.deepEqual(await denied.json(), { error: "File not found" });
    assert.deepEqual(ownershipLookups, [{ key: file.key, userId: otherUser.id }]);
    assert.equal(downloadCalls.length, 0);
    assert.ok(objects.has(file.key));

    const allowed = await fetch(`${baseUrl}/api/files/${file.key}/download`, { headers: { Cookie: cookie } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { url: `https://storage.example/downloaded/${file.key}?signature=test`, expiresIn: 60 });
    assert.deepEqual(downloadCalls, [file.key]);
});

test("unknown keys and legacy objects without metadata return the same 404 without storage access", async () => {
    const legacyKey = `${randomUUID()}.pdf`;
    objects.set(legacyKey, pdf);
    for (const key of [legacyKey, `${randomUUID()}.pdf`, "not-a-file-key"]) {
        const response = await fetch(`${baseUrl}/api/files/${key}/download`, { headers: { Cookie: cookie } });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: "File not found" });
    }
    assert.equal(downloadCalls.length, 0);
    assert.ok(objects.has(legacyKey));
});

test("anonymous download requests do not query ownership or access storage", async () => {
    const uploaded = await upload(multipart());
    const file = await uploaded.json();
    const response = await fetch(`${baseUrl}/api/files/${file.key}/download`);
    assert.equal(response.status, 401);
    assert.equal(ownershipLookups.length, 0);
    assert.equal(downloadCalls.length, 0);
    assert.ok(objects.has(file.key));
});

test("ownership lookup failures deny download without touching the object", async () => {
    const uploaded = await upload(multipart());
    const file = await uploaded.json();
    failOwnershipLookup = true;
    const response = await fetch(`${baseUrl}/api/files/${file.key}/download`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to prepare download" });
    assert.equal(downloadCalls.length, 0);
    assert.ok(objects.has(file.key));
});

test("an owned file that is no longer in storage returns 404 and retains its metadata", async () => {
    const uploaded = await upload(multipart());
    const file = await uploaded.json();
    const url = `${baseUrl}/api/files/${file.key}/download`;
    assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 200);
    const repeated = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(repeated.status, 404);
    assert.deepEqual(await repeated.json(), { error: "File not found" });
    assert.equal(records.length, 1);
});

test("storage failures after an ownership check retain the safe storage error response", async () => {
    const uploaded = await upload(multipart());
    const file = await uploaded.json();
    downloadError = new UserFacingError("File storage is unreachable, try again shortly", 503);
    const response = await fetch(`${baseUrl}/api/files/${file.key}/download`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "File storage is unreachable, try again shortly" });
    assert.deepEqual(downloadCalls, [file.key]);
    assert.ok(objects.has(file.key));
});
