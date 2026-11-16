import express from "express";
import type { ErrorRequestHandler } from "express";
import type session from "express-session";
import { createAuthRouter } from "#routes/auth/index.ts";
import type { UserRepository } from "#routes/auth/users.ts";
import { createSessionMiddleware } from "#utils/server/session.ts";
import { requireAuth } from "#utils/server/auth.ts";

export function createApp(users: UserRepository, store: session.Store, secret: string) {
    const app = express();
    // The Vercel image's Nginx is the only HTTP peer of Express, over loopback.
    // Docker Compose keeps its existing trust settings.
    if (process.env.DEPLOYMENT_TARGET === "vercel") app.set("trust proxy", "loopback");
    app.disable("x-powered-by");
    app.use(express.json({ limit: "16kb" }));
    app.use(createSessionMiddleware(store, secret));
    app.use("/api/auth", createAuthRouter(users));
    // Protect the whole namespace, including future file endpoints, before file handling.
    app.use("/api/files", requireAuth(users));
    return app;
}

// Install after all routes, including the file router.
export const handleErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === "entity.parse.failed") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
    }
    if (error?.type === "entity.too.large") {
        res.status(413).json({ error: "Request body is too large" });
        return;
    }
    console.error("Request failed:", error);
    res.status(500).json({ error: "Could not complete the request" });
};
