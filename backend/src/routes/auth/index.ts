import { Router } from "express";
import type { Request } from "express";
import bcrypt from "bcrypt";
import { SESSION_COOKIE, sessionCookieOptions } from "#utils/server/session.ts";
import type { UserRepository } from "./users.ts";

const BCRYPT_ROUNDS = 12;

function validEmail(value: unknown): value is string {
    return typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validPassword(value: unknown): value is string {
    // bcrypt only considers the first 72 bytes; reject longer passwords rather than silently truncating.
    return typeof value === "string" && value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72;
}

async function signIn(req: Request, userId: number) {
    // Discard the previous session ID to prevent session fixation.
    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = userId;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

export function createAuthRouter(users: UserRepository) {
    const router = Router();
    // Reuse the same work factor for unknown accounts so login does not short-circuit on missing users.
    const dummyHash = bcrypt.hash("unused-login-comparison", BCRYPT_ROUNDS);

    router.use((req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (req.method === "POST" && !req.is("application/json")) {
            res.status(415).json({ error: "Send an application/json request" });
            return;
        }
        next();
    });

    router.post("/register", async (req, res) => {
        const { username, email, password } = req.body ?? {};
        if (typeof username !== "string" || !/^[a-zA-Z0-9_-]{3,50}$/.test(username.trim())) {
            res.status(400).json({ error: "Username must be 3–50 letters, numbers, underscores or hyphens" });
            return;
        }
        if (!validEmail(email) || !validPassword(password)) {
            res.status(400).json({ error: "Provide a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes" });
            return;
        }
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        let user;
        try {
            user = await users.create(username.trim(), email.trim().toLowerCase(), passwordHash);
        } catch (error) {
            if ((error as { code?: string }).code === "23505") {
                res.status(409).json({ error: "Username or email is already registered" });
                return;
            }
            throw error;
        }
        await signIn(req, user.id);
        res.status(201).json({ user });
    });

    router.post("/login", async (req, res) => {
        const { email, password } = req.body ?? {};
        if (!validEmail(email) || !validPassword(password)) {
            res.status(400).json({ error: "Provide a valid email and password" });
            return;
        }
        const account = await users.findByEmail(email.trim().toLowerCase());
        const matches = await bcrypt.compare(password, account?.password_hash ?? await dummyHash);
        if (!account || !matches) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        await signIn(req, account.id);
        const { id, username, email: userEmail } = account;
        res.json({ user: { id, username, email: userEmail } });
    });

    router.get("/me", async (req, res) => {
        const user = req.session.userId ? await users.findById(req.session.userId) : undefined;
        if (!user) {
            res.status(401).json({ error: "You are not logged in" });
            return;
        }
        res.json({ user });
    });

    router.post("/logout", async (req, res) => {
        await new Promise<void>((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
        res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
        res.sendStatus(204);
    });

    return router;
}
