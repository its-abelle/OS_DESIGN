// utils/server/auth.ts
import type { RequestHandler } from "express";
import type { User, UserRepository } from "#routes/auth/users.ts";
import { SESSION_COOKIE, sessionCookieOptions } from "./session.ts";

declare module "express-serve-static-core" {
    interface Request {
        user?: User;
    }
}

export function requireAuth(users: Pick<UserRepository, "findById">): RequestHandler {
    return async (req, res, next) => {
        res.set("Cache-Control", "no-store");
        const userId = req.session?.userId;
        if (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) {
            res.status(401).json({ error: "You are not logged in" });
            return;
        }

        // Recheck the account so sessions for deleted users cannot access protected routes.
        // Database failures propagate to Express's error handler without granting access.
        const user = await users.findById(userId);
        if (!user) {
            await new Promise<void>((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
            res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
            res.status(401).json({ error: "You are not logged in" });
            return;
        }

        req.user = user;
        next();
    };
}
