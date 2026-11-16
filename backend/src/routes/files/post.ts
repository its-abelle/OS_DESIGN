// routes/files/post.ts
import type { RequestHandler } from "express";
import multer from "multer";
import { UserFacingError } from "#utils/server/errors.ts";
import type { FileRepository } from "./repository.ts";

export interface UploadStorage {
    maxUploadBytes: number;
    uploadPdf(buffer: Buffer): Promise<string>;
    deleteUploadedPdf(key: string): Promise<void>;
}

export function createAddFile(files: FileRepository, storage: UploadStorage): RequestHandler {
    const upload = multer({ limits: { fileSize: storage.maxUploadBytes, files: 1 } }).single("file");
    return async (req, res) => {
        if (!req.user) {
            res.status(401).json({ error: "You are not logged in" });
            return;
        }
        try {
            // 1. Parse the multipart body (in memory, size-capped)
            await new Promise<void>((resolve, reject) =>
                upload(req, res, (error: any) => {
                    if (error?.code === "LIMIT_FILE_SIZE") return reject(new UserFacingError("File is too large", 413));
                    if (error) return reject(new UserFacingError("Could not read the upload"));
                    resolve();
                }),
            );
            if (!req.file) {
                res.status(400).json({ error: "Please choose a PDF to upload" });
                return;
            }

            // 2. Store in S3
            const key = await storage.uploadPdf(req.file.buffer);

            // Only acknowledge success after both storage and metadata persistence succeed.
            let file;
            try {
                file = await files.create({
                    key,
                    originalFilename: req.file.originalname,
                    mimeType: "application/pdf",
                    sizeBytes: req.file.size,
                    uploadedBy: req.user.id,
                });
            } catch (error) {
                // PostgreSQL and S3 cannot share a transaction. Compensate for a failed insert.
                try {
                    await storage.deleteUploadedPdf(key);
                } catch (cleanupError) {
                    console.error("Upload rollback failed; storage object needs cleanup:", { key, error: cleanupError });
                }
                throw error;
            }
            res.status(201).json(file);
        } catch (error) {
            console.error("File Upload Error:", error);
            if (error instanceof UserFacingError) {
                res.status(error.status).json({ error: error.message });
                return;
            }
            res.status(500).json({ error: "Failed to upload file" });
        }
    };
}
