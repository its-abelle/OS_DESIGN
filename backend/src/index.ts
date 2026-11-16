// index.ts
import express from "express";
import filesRouter from "#routes/files/index.ts";
import { deleteDownloadedFiles, DOWNLOAD_GRACE_MS, ensureBucket } from "#utils/minio/objects.ts";

const PORT = parseInt(process.env.PORT ?? "", 10) || 3000;
const app = express();

app.use("/api/files", filesRouter);

// 1. Make sure storage is ready before taking traffic
await ensureBucket();

// 2. Sweep downloaded files whose URLs have expired
setInterval(() => {
    deleteDownloadedFiles().catch((error) => console.error("Download Cleanup Error:", error));
}, DOWNLOAD_GRACE_MS);

app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
