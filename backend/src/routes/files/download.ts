// routes/files/download.ts
import type { Request, Response } from "express";
import { getDownloadUrl, PRESIGN_SECONDS } from "#utils/minio/objects.ts";
import { UserFacingError } from "#utils/server/errors.ts";

export async function downloadFile(req: Request, res: Response) {
    try {
        // Shortcut: no ownership check yet. Look up the files row and 404 if it isn't the caller's.
        const url = await getDownloadUrl(String(req.params.key));
        return res.json({ url, expiresIn: PRESIGN_SECONDS });
    } catch (error) {
        console.error("File Download Error:", error);
        if (error instanceof UserFacingError) {
            return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: "Failed to prepare download" });
    }
}
