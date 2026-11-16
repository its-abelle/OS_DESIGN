// routes/files/index.ts
import { Router } from "express";
import { downloadFile } from "./download.ts";
import { addFile } from "./post.ts";

const router = Router();

// Authentication is enforced for the entire /api/files namespace in createApp.
router.post("/", addFile);
router.get("/:key/download", downloadFile);

export default router;
