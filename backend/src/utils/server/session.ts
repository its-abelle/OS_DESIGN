import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type pg from "pg";

declare module "express-session" {
    interface SessionData {
        userId: number;
    }
}

export const SESSION_COOKIE = "os.sid";
export const sessionCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
};

export function createSessionMiddleware(store: session.Store, secret: string) {
    if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
    return session({
        name: SESSION_COOKIE,
        secret,
        store,
        resave: false,
        saveUninitialized: false,
        cookie: { ...sessionCookieOptions, maxAge: 24 * 60 * 60 * 1000 },
    });
}

export function createSessionStore(pool: pg.Pool) {
    const PgStore = connectPgSimple(session);
    return new PgStore({ pool, tableName: "session", createTableIfMissing: false });
}
