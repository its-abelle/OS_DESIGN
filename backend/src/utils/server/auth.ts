// utils/server/auth.ts
import type { NextFunction, Request, Response } from "express";

// Shortcut: no auth yet, every request passes. Replace with the express-session check before this leaves localhost.
export function requireAuth(_req: Request, _res: Response, next: NextFunction) {
    next();
}
