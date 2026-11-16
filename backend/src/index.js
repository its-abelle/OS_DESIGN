import express from "express";
import multer from "multer";
import { putPdf, presignGet, s3Status, ensureBucket, MAX_BYTES } from "./s3.js";

const app = express();
const upload = multer({ limits: { fileSize: MAX_BYTES } }).single("file");

// TODO(auth): session middleware + requireAuth; TODO(db): insert/lookup files rows.
const requireAuth = (_req, _res, next) => next();

app.post("/api/files", requireAuth, (req, res, next) =>
  upload(req, res, async (err) => {
    if (err) return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "no file" });
    try { res.status(201).json({ key: await putPdf(req.file.buffer) }); }
    catch (e) { res.status(s3Status(e)).json({ error: e.message }); }
  }));

app.get("/api/files/:key/download", requireAuth, async (req, res) => {
  try { res.json({ url: await presignGet(req.params.key) }); }
  catch (e) { res.status(s3Status(e)).json({ error: e.name === "NotFound" ? "missing object" : e.message }); }
});

await ensureBucket();
app.listen(3000, () => console.log("backend :3000"));
