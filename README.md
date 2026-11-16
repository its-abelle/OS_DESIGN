# Dockerized Authentication and Cloud File Storage System

A university practical: a small web app, run entirely in Docker, where users register, log in, upload PDFs and download them again. Account and file records live in PostgreSQL; the PDFs themselves live in S3-compatible object storage (MinIO locally, Amazon S3 in production with no code change).

## Status

| Part | State |
|------|-------|
| S3 storage (upload, presigned download, cleanup) | **Working, tested** |
| Express API routes for files | Working, auth is a pass-through stub |
| PostgreSQL (`users`, `files`, `session`) | Accounts and sessions wired; file records not wired yet |
| Registration, login, logout, sessions (bcrypt, express-session) | Route tests and type checking pass on Node 24; PostgreSQL storage and session persistence verified through Nginx |
| Web servers (Nginx + Apache) | Configuration checks and page/API routing verified in Docker |
| Frontend (HTML/CSS/JS) | Stub: placeholder page served by Apache |

## Architecture

```
Browser ──:8080──> frontend (Nginx) ──/──────> apache (HTML/CSS/JS)
   │                      │
   │                      └──/api/──> backend (Express) ──> database (PostgreSQL)
   │                                      │
   └── presigned GET (:9100) ──> minio <─────┘ PutObject / Copy / Delete
```

- Nginx is the public web entry point on port 8080. It applies the upload body
  limit and forwards API requests to Express, keeping the `/api/` prefix.
- Apache HTTP Server serves `frontend/public/` through the official `httpd` image.
  It has no published host port; browsers reach it through Nginx. HTML/CSS/JS and
  API requests share the same browser origin for session cookies.
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
├── compose.yaml              # minio, database, backend, apache, frontend (Nginx)
├── .env.example              # copy to .env
├── .nvmrc                    # Node 24 for local development
├── db/init.sql               # PostgreSQL account, file and session schema
├── frontend/
│   ├── public/               # HTML/CSS/JS mounted into Apache (currently a stub)
│   ├── templates/            # Nginx reverse-proxy configuration
│   └── 15-upload-limit.envsh # Derives Nginx body limit from MAX_UPLOAD_MB
└── backend/
    ├── Dockerfile
    ├── package.json          # "#*" import alias → src/*
    ├── src/
    │   ├── app.ts            # app factory, JSON parsing, sessions, auth and errors
    │   ├── index.ts          # database checks, bucket check, file routes, cleanup
    │   ├── routes/auth/      # registration/login/logout/me and user repository
    │   ├── routes/files/     # index.ts (router), post.ts (addFile), download.ts (downloadFile)
    │   └── utils/
    │       ├── database.ts   # shared PostgreSQL connection pool
    │       ├── minio/        # client.ts (S3 clients + config), objects.ts (upload, download, cleanup)
    │       └── server/       # session.ts, errors.ts, auth.ts (file protection stub)
    └── test/                 # auth.test.ts and minio.test.ts
```

TypeScript runs directly on Node 24+ (type stripping), with no build step.
The repository's `.nvmrc` selects Node 24. If you use nvm, run `nvm use` from the
project root before running npm commands. Node 20 cannot execute the `.ts` tests
directly and fails with `ERR_UNKNOWN_FILE_EXTENSION`.

## Run and test

The authentication dependencies are recorded in `backend/package-lock.json`.
Use `npm ci` in `backend/` to install the locked dependencies.

```bash
cp .env.example .env               # then set real secrets
nvm use                           # if using nvm; otherwise activate Node 24+
docker compose up -d minio         # S3 only; `docker compose up --build -d` for everything
cd backend
npm ci
npm test                           # auth route tests and storage tests against MinIO
npm run typecheck
npm run test:auth                  # auth route tests; no MinIO or database required
```

MinIO console: http://localhost:9101 (log in with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `.env`). Host ports 9100/9101 are used because 9000/9001 are commonly taken.

Run the API on the host:

```bash
S3_ENDPOINT=http://localhost:9100 PORT=3300 node --env-file=../.env src/index.ts
```

For host execution, `DATABASE_URL` must also point to a reachable PostgreSQL
instance initialized with `db/init.sql`; the Compose database hostname is only
reachable from containers.

## Authentication API

Requests and responses use JSON. Registration signs the new user in automatically.
Passwords are hashed with bcrypt (cost 12); responses never contain password hashes.

| Endpoint | Request | Success |
|----------|---------|---------|
| `POST /api/auth/register` | `{ "username": "alice", "email": "alice@example.com", "password": "a-long-password" }` | `201`, `{ "user": { "id": 1, "username": "alice", "email": "alice@example.com" } }` |
| `POST /api/auth/login` | `{ "email": "alice@example.com", "password": "a-long-password" }` | `200`, same user shape |
| `GET /api/auth/me` | Session cookie | `200`, same user shape; `401` when signed out |
| `POST /api/auth/logout` | `{}` and session cookie | `204`, destroys session and clears cookie |

Send `Content-Type: application/json` for POST requests. Usernames are case-sensitive
and accept 3–50 letters, numbers, underscores or hyphens. Emails are trimmed and
lowercased. Passwords require at least 8 characters and at most 72 UTF-8 bytes
(bcrypt's limit). Duplicate usernames/emails return `409`. Incorrect credentials
return `401` with the same message for unknown accounts and wrong passwords.

Sessions are stored in PostgreSQL, last 24 hours, and use an HttpOnly, SameSite=Lax
cookie named `os.sid`. A new session ID is issued on registration/login. Set
`SESSION_SECRET` to a random value of at least 32 characters; update existing `.env`
files that still contain the old short placeholder. With `NODE_ENV=production`,
cookies require HTTPS. The current Nginx example serves HTTP; TLS termination and
an appropriate Express proxy configuration are required before using secure cookies
through a reverse proxy.

The existing schema already contains the required account/session tables; no reset
of an existing database volume is needed for this step. The backend checks that
these tables exist at startup.

File routes still use the pass-through `requireAuth` stub. Replacing that stub is
the next step, followed by file metadata persistence and ownership checks. File
listing and the frontend are still pending. Authentication tests use an isolated
in-memory repository/session store. Manual Docker integration checks verified
registration, stored bcrypt hashes, duplicate-account rejection, PostgreSQL session
storage, session persistence after a backend restart, login/session ID rotation,
invalid-password rejection, and logout invalidation. The temporary verification
account and its sessions were removed afterward. Automated PostgreSQL integration
regression tests remain to be added.

## Switching to Amazon S3

Unset `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT`, set `AWS_REGION`, `S3_BUCKET_NAME`, and an IAM user's keys. Keep Block Public Access on. The minimum policy is `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` plus `s3:ListBucket` on `arn:aws:s3:::<bucket>` (and `s3:CreateBucket` only if the backend should create it).
