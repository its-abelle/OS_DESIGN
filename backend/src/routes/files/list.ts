import type { RequestHandler } from "express";
import type { FileRepository } from "./repository.ts";
import { UserFacingError } from "#utils/server/errors.ts";

export interface ListingStorage {
    isUploadedPdfAvailable(key: string): Promise<boolean>;
    maxUploadBytes: number;
}

function integerParameter(value: unknown, maximum: number): number | undefined {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : undefined;
}

export function createListFiles(files: Pick<FileRepository, "listOwnedBy">, storage: ListingStorage): RequestHandler {
    return async (req, res) => {
        if (!req.user) {
            res.status(401).json({ error: "You are not logged in" });
            return;
        }
        const limit = req.query.limit === undefined ? 20 : integerParameter(req.query.limit, 20);
        const beforeId = req.query.before === undefined ? undefined : integerParameter(req.query.before, 2147483647);
        if (!limit || (req.query.before !== undefined && beforeId === undefined)) {
            res.status(400).json({ error: "Use a limit from 1 to 20 and a positive integer before cursor" });
            return;
        }
        try {
            const page = await files.listOwnedBy(req.user.id, limit, beforeId);
            const entries = await Promise.all(page.files.map(async (file) => ({
                ...file, available: await storage.isUploadedPdfAvailable(file.key),
            })));
            res.json({ files: entries, nextCursor: page.nextCursor, maxUploadBytes: storage.maxUploadBytes });
        } catch (error) {
            console.error("File Listing Error:", error);
            if (error instanceof UserFacingError) {
                res.status(error.status).json({ error: error.message });
                return;
            }
            res.status(500).json({ error: "Failed to list files" });
        }
    };
}
