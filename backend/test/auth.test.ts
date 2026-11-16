import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import session from "express-session";
import bcrypt from "bcrypt";
import { createApp, handleErrors } from "../src/app.ts";
import type { Account, UserRepository } from "../src/routes/auth/users.ts";

// Route tests deliberately use an in-memory repository/store; production always uses PostgreSQL.
const accounts: Account[] = [];
let userLookupFails = false;
let protectedHandlerCalls = 0;
const users: UserRepository = {
    async create(username, email, password_hash) {
        if (accounts.some((account) => account.username === username || account.email === email)) {
            throw Object.assign(new Error("duplicate account"), { code: "23505" });
        }
        const account = { id: accounts.length + 1, username, email, password_hash };
        accounts.push(account);
        return { id: account.id, username, email };
    },
    async findByEmail(email) { return accounts.find((account) => account.email === email); },
    async findById(id) {
        if (userLookupFails) throw new Error("Database is unavailable");
        const account = accounts.find((account) => account.id === id);
        if (!account) return undefined;
        return { id: account.id, username: account.username, email: account.email };
    },
};

let server: Server;
let baseUrl: string;
const store = new session.MemoryStore();

before(async () => {
    const app = createApp(users, store, "test-secret-that-is-at-least-32-characters");
    // Probe handlers isolate authentication from multipart parsing and S3 operations.
    const protectedHandler: import("express").RequestHandler = (req, res) => {
        protectedHandlerCalls++;
        res.json({ user: req.user });
    };
    app.post("/api/files", protectedHandler);
    app.get("/api/files/:key/download", protectedHandler);
    app.get("/api/files/future-route", protectedHandler);
    app.use(handleErrors);
    server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve(listener));
        listener.on("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});

after(async () => {
    store.clear();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function post(path: string, body: unknown, cookie?: string) {
    return fetch(`${baseUrl}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body),
    });
}

function getCookie(response: Response) {
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);
    return cookie.split(";")[0]!;
}

test("registration hashes the password, normalizes email and establishes a session", async () => {
    const response = await post("register", { username: "alice", email: " Alice@Example.com ", password: "correct-password" });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body, { user: { id: 1, username: "alice", email: "alice@example.com" } });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/i);
    assert.notEqual(accounts[0]!.password_hash, "correct-password");
    assert.equal(await bcrypt.compare("correct-password", accounts[0]!.password_hash), true);

    const me = await fetch(`${baseUrl}/me`, { headers: { Cookie: getCookie(response) } });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), body);
});

test("duplicate usernames and normalized emails return 409", async () => {
    assert.equal((await post("register", { username: "alice", email: "other@example.com", password: "password-123" })).status, 409);
    assert.equal((await post("register", { username: "other", email: "ALICE@example.com", password: "password-123" })).status, 409);
});

test("validation rejects missing fields, invalid email and passwords exceeding bcrypt's byte limit", async () => {
    for (const body of [
        {},
        { username: "a", email: "a@example.com", password: "password-123" },
        { username: "new-user", email: "invalid", password: "password-123" },
        { username: "new-user", email: "a@example.com", password: "short" },
        { username: "new-user", email: "a@example.com", password: "é".repeat(37) },
        { username: "new-user", email: "a@example.com", password: "a".repeat(73) },
    ]) {
        assert.equal((await post("register", body)).status, 400);
    }
});

test("wrong passwords and unknown accounts have the same response", async () => {
    const wrong = await post("login", { email: "alice@example.com", password: "wrong-password" });
    const missing = await post("login", { email: "missing@example.com", password: "wrong-password" });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.deepEqual(await wrong.json(), await missing.json());
    assert.equal(wrong.headers.get("set-cookie"), null);
});

test("login rotates the session ID and logout invalidates the server session", async () => {
    const first = await post("login", { email: "ALICE@example.com", password: "correct-password" });
    assert.equal(first.status, 200);
    const oldCookie = getCookie(first);
    const second = await post("login", { email: "alice@example.com", password: "correct-password" }, oldCookie);
    assert.equal(second.status, 200);
    const newCookie = getCookie(second);
    assert.notEqual(newCookie, oldCookie);
    assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: oldCookie } })).status, 401);
    assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: newCookie } })).status, 200);
    const logout = await post("logout", {}, newCookie);
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: newCookie } })).status, 401);
});

test("anonymous and tampered session cookies are rejected", async () => {
    assert.equal((await fetch(`${baseUrl}/me`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: "os.sid=tampered" } })).status, 401);
});

test("cross-site form submissions and malformed JSON do not reach authentication", async () => {
    const form = await fetch(`${baseUrl}/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=alice%40example.com&password=correct-password",
    });
    assert.equal(form.status, 415);
    const malformed = await fetch(`${baseUrl}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
    });
    assert.equal(malformed.status, 400);
    const oversized = await post("login", { email: "a".repeat(20000), password: "password-123" });
    assert.equal(oversized.status, 413);
});

async function fileRequests(cookie?: string) {
    const headers = cookie ? { Cookie: cookie } : undefined;
    return [
        await fetch(`${baseUrl}/../files`, { method: "POST", headers, body: "unparsed upload body" }),
        await fetch(`${baseUrl}/../files/example.pdf/download`, { headers }),
        await fetch(`${baseUrl}/../files/future-route`, { headers }),
    ];
}

async function expectFileRequestsDenied(cookie?: string, status = 401) {
    const callsBefore = protectedHandlerCalls;
    for (const response of await fileRequests(cookie)) {
        assert.equal(response.status, status);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.deepEqual(await response.json(), { error: status === 401 ? "You are not logged in" : "Could not complete the request" });
    }
    assert.equal(protectedHandlerCalls, callsBefore, "rejected requests never reach file handlers");
}

async function registerTestAccount(username: string) {
    const response = await post("register", { username, email: `${username}@example.com`, password: "test-password-123" });
    assert.equal(response.status, 201);
    return { cookie: getCookie(response), user: (await response.json()).user as { id: number; username: string; email: string } };
}

async function findStoredSession(userId: number) {
    const sessions = await new Promise<Record<string, session.SessionData>>((resolve, reject) => {
        store.all((error, entries) => error ? reject(error) : resolve(entries as Record<string, session.SessionData>));
    });
    const entry = Object.entries(sessions).find(([, data]) => data.userId === userId);
    assert.ok(entry, "registered account has a stored session");
    return entry;
}

test("all file endpoints reject anonymous and tampered-cookie requests before file handling", async () => {
    await expectFileRequestsDenied();
    await expectFileRequestsDenied("os.sid=tampered");
});

test("a valid session reaches file endpoints with the current user attached", async () => {
    const account = await registerTestAccount("protected-user");
    for (const response of await fileRequests(account.cookie)) {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { user: account.user });
    }
});

test("file endpoints reject logged-out sessions", async () => {
    const account = await registerTestAccount("logged-out-user");
    assert.equal((await post("logout", {}, account.cookie)).status, 204);
    await expectFileRequestsDenied(account.cookie);
});

test("file endpoints reject expired sessions", async () => {
    const account = await registerTestAccount("expired-user");
    const [id, data] = await findStoredSession(account.user.id);
    data.cookie.expires = new Date(Date.now() - 1000);
    await new Promise<void>((resolve, reject) => store.set(id, data, (error) => error ? reject(error) : resolve()));
    await expectFileRequestsDenied(account.cookie);
});

test("file endpoints reject deleted accounts and destroy their stale session", async () => {
    const account = await registerTestAccount("deleted-user");
    const [id] = await findStoredSession(account.user.id);
    accounts.splice(accounts.findIndex((entry) => entry.id === account.user.id), 1);
    await expectFileRequestsDenied(account.cookie);
    const remaining = await new Promise<session.SessionData | null | undefined>((resolve, reject) => {
        store.get(id, (error, data) => error ? reject(error) : resolve(data));
    });
    assert.equal(remaining, undefined);
});

test("database lookup failures return 500 without granting file access", async (t) => {
    const account = await registerTestAccount("database-error-user");
    t.mock.method(console, "error", () => {});
    userLookupFails = true;
    try {
        await expectFileRequestsDenied(account.cookie, 500);
    } finally {
        userLookupFails = false;
    }
});
