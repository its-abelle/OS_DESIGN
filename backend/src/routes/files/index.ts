// routes/files/index.ts
import { Router } from "express";
import { requireAuth } from "#utils/server/auth.ts";
import { downloadFile } from "./download.ts";
import { addFile } from "./post.ts";

const router = Router();

router.post("/", requireAuth, addFile);
router.get("/:key/download", requireAuth, downloadFile);

export default router;
