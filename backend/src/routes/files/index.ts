// routes/files/index.ts
import { Router } from "express";
import { downloadFile } from "./download.ts";
import { createAddFile } from "./post.ts";
import type { FileRepository } from "./repository.ts";
import { MAX_UPLOAD_BYTES } from "#utils/minio/client.ts";
import { deleteUploadedPdf, uploadPdf } from "#utils/minio/objects.ts";

export function createFilesRouter(files: FileRepository) {
    const router = Router();

    // Authentication is enforced for the entire /api/files namespace in createApp.
    router.post("/", createAddFile(files, { uploadPdf, deleteUploadedPdf, maxUploadBytes: MAX_UPLOAD_BYTES }));
    router.get("/:key/download", downloadFile);

    return router;
}
