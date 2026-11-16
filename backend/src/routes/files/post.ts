// routes/files/post.ts
import type { Request, Response } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES } from "#utils/minio/client.ts";
import { uploadPdf } from "#utils/minio/objects.ts";
import { UserFacingError } from "#utils/server/errors.ts";

const upload = multer({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single("file");

export async function addFile(req: Request, res: Response) {
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
            return res.status(400).json({ error: "Please choose a PDF to upload" });
        }

        // 2. Store in S3
        const key = await uploadPdf(req.file.buffer);

        // Shortcut: metadata isn't saved to the files table yet. Insert the row here once Postgres is wired.
        return res.status(201).json({ key, originalFilename: req.file.originalname, sizeBytes: req.file.size });
    } catch (error) {
        console.error("File Upload Error:", error);
        if (error instanceof UserFacingError) {
            return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: "Failed to upload file" });
    }
}
