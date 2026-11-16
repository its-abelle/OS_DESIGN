// index.ts
import { createApp, handleErrors } from "./app.ts";
import { pool } from "#utils/database.ts";
import { createSessionStore } from "#utils/server/session.ts";
import { createUserRepository } from "#routes/auth/users.ts";
import { createFilesRouter } from "#routes/files/index.ts";
import { createFileRepository } from "#routes/files/repository.ts";
import { deleteDownloadedFiles, DOWNLOAD_GRACE_MS, ensureBucket } from "#utils/minio/objects.ts";

const PORT = parseInt(process.env.PORT ?? "", 10) || 3000;
const app = createApp(createUserRepository(pool), createSessionStore(pool), process.env.SESSION_SECRET ?? "");

app.use("/api/files", createFilesRouter(createFileRepository(pool)));
app.use(handleErrors);

// 1. Make sure storage is ready before taking traffic
await pool.query("SELECT id FROM users LIMIT 0");
await pool.query('SELECT sid FROM "session" LIMIT 0');
await pool.query("SELECT id FROM files LIMIT 0");
await ensureBucket();
// Container instances may have been asleep when older download URLs expired.
deleteDownloadedFiles().catch((error) => console.error("Startup Download Cleanup Error:", error));

// 2. Sweep downloaded files whose URLs have expired
setInterval(() => {
    deleteDownloadedFiles().catch((error) => console.error("Download Cleanup Error:", error));
}, DOWNLOAD_GRACE_MS);

app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
