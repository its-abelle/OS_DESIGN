# Dockerized Authentication and Cloud File Storage System

A university practical: a small web app, run entirely in Docker, where users register, log in, upload PDFs and download them again. Account and file records live in PostgreSQL; the PDFs themselves live in S3-compatible object storage (MinIO locally, Amazon S3 in production with no code change).

## Status

| Part | State |
|------|-------|
| S3 storage (upload, presigned download, cleanup) | **Working, tested** |
| Express API routes for files | Session-protected uploads and owner-only download URL requests |
| PostgreSQL (`users`, `files`, `session`) | Accounts, sessions and new upload metadata wired |
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
2. **Download** (`GET /api/files/:key/download`): PostgreSQL first verifies that the logged-in user uploaded the file. Missing metadata and other users' files both return `404` before storage is accessed. An authorized request moves the object to `downloaded/<key>`, deletes the live copy, and returns a presigned URL for the moved copy. A second sequential URL request gets `404`; issued URLs remain reusable until expiry, and concurrent requests are not yet claimed atomically.
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
    │   ├── routes/files/     # router, upload handler factory and download handler
    │   │                     # repository.ts persists metadata and checks ownership
    │   └── utils/
    │       ├── database.ts   # shared PostgreSQL connection pool
    │       ├── minio/        # client.ts (S3 clients + config), objects.ts (upload, download, cleanup)
    │       └── server/       # sessions, errors and file-route authentication
    └── test/                 # auth.test.ts, files.test.ts and minio.test.ts
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
npm run test:files                 # metadata, rollback and ownership tests; no services required
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

All `/api/files` endpoints require a signed session cookie for an existing user.
Anonymous, invalid, expired and logged-out sessions return `401` before multipart
parsing or storage access. Sessions for deleted accounts are destroyed and rejected.
Database lookup failures return `500` without granting access. The middleware
attaches the current account to `req.user` for upload attribution and ownership checks.
The guard covers the whole file namespace so new file endpoints inherit protection.
Registration and login remain public; `/api/auth/me` checks its own session.

File listing and the frontend are still pending. Download URL requests are scoped
to the logged-in user's ID and the file's storage key using a parameterized query.
Other users' files and missing metadata both return `404` with `File not found`.
Database ownership lookup failures return `500` without accessing storage. Presigned URLs
are temporary bearer links: once issued, storage accepts them until expiry even
if the application session is logged out.

Authentication and route-protection tests use an isolated
in-memory repository/session store. Manual Docker integration checks verified
registration, stored bcrypt hashes, duplicate-account rejection, PostgreSQL session
storage, session persistence after a backend restart, login/session ID rotation,
invalid-password rejection, and logout invalidation. The temporary verification
account and its sessions were removed afterward. File-route integration checks
also verified authenticated PDF upload/download, anonymous/invalid-cookie rejection,
expired/logout/deleted-account session rejection, and that an unauthorized download
request does not consume the stored file. Temporary verification files were removed.
Automated PostgreSQL integration
regression tests remain to be added.

## File metadata

`POST /api/files` accepts a PDF in the multipart `file` field. After storing the
PDF, the backend inserts its original filename, UUID storage key, validated PDF
type, actual byte count and authenticated uploader ID into PostgreSQL's `files`
table. PostgreSQL supplies the record ID and upload timestamp. Client-supplied
uploader IDs, sizes and MIME fields do not override this metadata.

The `201` response retains the existing `key`, `originalFilename` and `sizeBytes`
fields and adds `id`, `mimeType`, `uploadedBy` and `createdAt` (an ISO timestamp).
Success is returned only after both the object upload and metadata insert complete.
If metadata insertion fails, the backend attempts to delete the uploaded object
and returns an error. If that cleanup also fails, the object key is logged for
recovery. This is best-effort compensation, not a transaction across S3 and
PostgreSQL; crashes or uncertain network outcomes can still require reconciliation.

The existing `files` schema already supports these records, so this step does not
require resetting database volumes. Metadata applies to new uploads; older stored
objects are not backfilled because their owners are unknown. Upload metadata is
required for downloads, so older objects without metadata cannot receive new
download URLs; upload them again under the correct account. Upload metadata is
retained when downloads move/delete the PDF, so it records upload history rather
than guaranteeing that the object is still available. File listing and download
state tracking will need to account for that lifecycle.

Manual checks through Nginx verified that response metadata matches PostgreSQL,
client-supplied uploader/size fields are ignored, metadata survives a backend
restart, and the uploaded PDF can still be downloaded. Temporary verification
rows and storage objects were removed. Automated tests cover metadata insertion,
input rejection, storage errors, insert rollback and cleanup failure handling.

Ownership tests cover cross-user requests, spoofed owner parameters, missing or
untracked keys, failed database lookups, and storage failures after authorization.
Manual checks with two real accounts through Nginx verified that each user can
download their own PDF, cannot obtain a URL for the other user's PDF, and cannot
consume it through a rejected request. Unknown keys, SQL-like key values and
objects without metadata returned `404`. Temporary accounts, records and PDFs
were removed afterward.

## Switching to Amazon S3

Unset `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT`, set `AWS_REGION`, `S3_BUCKET_NAME`, and an IAM user's keys. Keep Block Public Access on. The minimum policy is `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` plus `s3:ListBucket` on `arn:aws:s3:::<bucket>` (and `s3:CreateBucket` only if the backend should create it).
