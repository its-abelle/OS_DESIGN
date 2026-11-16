import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import session from "express-session";

// This test file runs in its own Node test process, with production cookie settings.
process.env.NODE_ENV = "production";
process.env.DEPLOYMENT_TARGET = "vercel";
const { createApp, handleErrors } = await import("../src/app.ts");
const user = { id: 7, username: "deployment-user", email: "deployment@example.com" };
const store = new session.MemoryStore();
let server: Server;
let base: string;

before(async () => {
    const app = createApp({
        async create() { return user; },
        async findByEmail() { return undefined; },
        async findById(id) { return id === user.id ? user : undefined; },
    }, store, "production-test-secret-at-least-32-characters");
    app.use(handleErrors);
    server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve(listener));
        listener.on("error", reject);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    store.clear();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function register(forwardedHttps: boolean) {
    return fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(forwardedHttps ? { "X-Forwarded-Proto": "https" } : {}) },
        body: JSON.stringify({ ...user, password: "deployment-password" }),
    });
}

test("the Vercel loopback proxy preserves secure session cookies behind HTTPS termination", async () => {
    const response = await register(true);
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /HttpOnly/i);
    const me = await fetch(`${base}/api/auth/me`, {
        headers: { Cookie: cookie.split(";")[0]!, "X-Forwarded-Proto": "https" },
    });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { user });
});

test("production does not issue a secure session cookie over plain HTTP", async () => {
    const response = await register(false);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("set-cookie"), null);
});

test("the Vercel upload limit stays below the platform payload ceiling even if configured higher", async () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.S3_BUCKET_NAME = "deployment-test";
    process.env.AWS_ACCESS_KEY_ID = "test-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
    process.env.MAX_UPLOAD_MB = "10";
    const { MAX_UPLOAD_BYTES } = await import("../src/utils/minio/client.ts");
    assert.equal(MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
});
