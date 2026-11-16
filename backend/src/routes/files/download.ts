// routes/files/download.ts
import type { RequestHandler } from "express";
import { UserFacingError } from "#utils/server/errors.ts";
import type { FileRepository } from "./repository.ts";

export interface DownloadStorage {
    getDownloadUrl(key: string): Promise<string>;
    presignSeconds: number;
}

export function createDownloadFile(files: Pick<FileRepository, "isOwnedBy">, storage: DownloadStorage): RequestHandler {
    return async (req, res) => {
        if (!req.user) {
            res.status(401).json({ error: "You are not logged in" });
            return;
        }
        try {
            const key = String(req.params.key);
            // Check ownership before the storage operation moves/deletes the original PDF.
            if (!await files.isOwnedBy(key, req.user.id)) {
                res.status(404).json({ error: "File not found" });
                return;
            }
            const url = await storage.getDownloadUrl(key);
            res.json({ url, expiresIn: storage.presignSeconds });
        } catch (error) {
            console.error("File Download Error:", error);
            if (error instanceof UserFacingError) {
                res.status(error.status).json({ error: error.message });
                return;
            }
            res.status(500).json({ error: "Failed to prepare download" });
        }
    };
}
