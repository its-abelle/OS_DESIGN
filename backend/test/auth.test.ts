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
    app.use(handleErrors);
    server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
        listener.on("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});

after(async () => {
    store.clear();
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
