# Dockerized Authentication and Cloud File Storage System

A university practical: a small web app, run entirely in Docker, where users register, log in, upload PDFs and download them again. Account and file records live in PostgreSQL; the PDFs themselves live in S3-compatible object storage (MinIO locally, Amazon S3 in production with no code change).

## Status

| Part | State |
|------|-------|
| S3 storage (upload, presigned download, cleanup) | **Working, tested** |
| Express API routes for files | Working, auth is a pass-through stub |
| PostgreSQL schema (`users`, `files`, `session`) | Stub: schema only, not wired to the backend |
| Registration, login, sessions (bcrypt, express-session) | Not started |
| Frontend (Nginx + HTML/CSS/JS) | Stub: placeholder page, `/api/` proxied to the backend |

## Architecture

```
Browser ──:8080──> frontend (Nginx) ──/api/──> backend (Express) ──> database (PostgreSQL)
   │                                              │
   └──── presigned GET (:9100) ──> minio (S3) <───┘ PutObject / Copy / Delete
```

- The backend is the only thing holding storage credentials. The browser never sees keys; it gets a 60 second presigned URL.
- The bucket is private. Anonymous reads are denied.
- PostgreSQL and MinIO data sit in named volumes, so they survive container restarts.

## How storage works

1. **Upload** (`POST /api/files`, multipart field `file`): the body is size-capped (`MAX_UPLOAD_MB`, default 10), the first bytes must be `%PDF-` (checked on content, not on the client's mime type), and the object gets a random UUID key.
2. **Download** (`GET /api/files/:key/download`): the object is moved to `downloaded/<key>`, the live copy is deleted, and a presigned URL for the moved copy is returned. A file can be downloaded once; a second request gets 404.
3. **Cleanup**: `deleteDownloadedFiles()` runs on an interval in the backend and deletes everything under `downloaded/` older than the URL lifetime plus one minute. It's stateless, so it survives restarts and is safe to run from several instances.

Storage failures come back as human messages: 404 file not found, 502 bad credentials, 503 storage unreachable. The process never crashes on them.

## Project structure

```
.
├── compose.yaml              # minio, database, backend, frontend
├── .env.example              # copy to .env
├── db/init.sql               # PostgreSQL schema (stub)
├── frontend/                 # Nginx config + placeholder page (stub)
└── backend/
    ├── Dockerfile
    ├── package.json          # "#*" import alias → src/*
    ├── src/
    │   ├── index.ts          # app setup, bucket check, cleanup interval
    │   ├── routes/files/     # index.ts (router), post.ts (addFile), download.ts (downloadFile)
    │   └── utils/
    │       ├── minio/        # client.ts (S3 clients + config), objects.ts (upload, download, cleanup)
    │       └── server/       # errors.ts (UserFacingError), auth.ts (stub)
    └── test/minio.test.ts
```

TypeScript runs directly on Node 24+ (type stripping), with no build step.

## Run and test

```bash
cp .env.example .env               # then set real secrets
docker compose up -d minio         # S3 only; `docker compose up --build -d` for everything
cd backend && npm install
npm test                           # storage tests against MinIO
npm run typecheck
```

MinIO console: http://localhost:9101 (log in with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `.env`). Host ports 9100/9101 are used because 9000/9001 are commonly taken.

Run the API on the host:

```bash
S3_ENDPOINT=http://localhost:9100 PORT=3300 node --env-file=../.env src/index.ts
```

## Switching to Amazon S3

Unset `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT`, set `AWS_REGION`, `S3_BUCKET_NAME`, and an IAM user's keys. Keep Block Public Access on. The minimum policy is `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` plus `s3:ListBucket` on `arn:aws:s3:::<bucket>` (and `s3:CreateBucket` only if the backend should create it).
