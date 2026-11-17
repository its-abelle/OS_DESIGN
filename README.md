# Department of Files — COSC 428

A PHP and MySQL application for registering accounts, signing in, uploading PDFs
and collecting them through temporary links. Apache executes the PHP GUI and API
in the backend container. Nginx is the public reverse proxy. MinIO holds private
PDF bytes; MySQL holds accounts, sessions and file receipts.

The migration is implemented but **has not been executed in the editing
session**: PHP is unavailable, Docker access is denied, and terminal networking
cannot reach Packagist. Earlier Node/PostgreSQL test results do not validate this
implementation. Run the checks below on Ubuntu before the demonstration.

## Architecture

```text
Ubuntu host (or Ubuntu guest VM; instructions provided separately)
└── Docker Compose network
    Browser → :8080 Nginx → backend:80 Apache + PHP
                                     ├── database:3306 MySQL 8.4
                                     └── minio:9000 private PDF storage
    Browser ← :9100 MinIO, through a 60-second signed download link
    cleanup worker → MinIO expired copies + MySQL expired sessions
```

Five services: `frontend`, `backend`, `database`, `minio`, `cleanup`. Apache and
PHP 8.4 share the backend image. MySQL has no published host port. Named volumes
`mysql_data` and `minio_data` preserve records and objects. Docker runs on Ubuntu;
its container images do not need to be Ubuntu-based. Direct Ubuntu hosting does
not demonstrate the assignment's separate VM requirement.

## Start on existing Ubuntu

Install Docker Engine, its Compose plugin, Git and Python 3 using
[the Ubuntu setup guide](docs/UBUNTU-SETUP.md). PHP/Composer run inside Docker.
For a fresh checkout:

```bash
cp .env.example .env
```

Replace the three password placeholders in `.env` with different random values.
For an existing PostgreSQL checkout, follow the upgrade steps below instead of
overwriting `.env`.

```bash
docker compose config --quiet
docker compose up --build -d --remove-orphans --wait
docker compose ps
curl --fail http://localhost:8080/api/health
```

Open **http://localhost:8080**. MinIO's administration console is
**http://localhost:9101**, available on the Ubuntu host only. Its credentials are
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from `.env`.
For a browser on another computer, set
`S3_PUBLIC_ENDPOINT=http://<Ubuntu-IP>:9100` and open `http://<Ubuntu-IP>:8080`.
After changing `.env`:

```bash
docker compose up -d --force-recreate backend cleanup
```

`MAX_UPLOAD_MB` is an integer from 1 to 100 (default 10). Nginx allows one MB of
multipart overhead; PHP checks the actual file size. Keep
`SESSION_COOKIE_SECURE=false` for local HTTP; use `true` for HTTPS browser access.

## Upgrade from Express/PostgreSQL

MySQL uses a **new volume**. The PostgreSQL volume remains untouched; existing
accounts and receipts are not copied automatically. Express sessions are not
compatible with PHP sessions. Users sign in again after migration.
If preserving accounts and receipts, export **before** replacing the old container:

```bash
docker ps --format '{{.Names}}'
# Substitute the actual old PostgreSQL container name.
python3 scripts/export-postgres.py os_design-database-1 migration-data.json
```

The ignored, private export contains password hashes and metadata. PHP can verify
existing bcrypt hashes. PDF bytes remain in the existing MinIO volume. Then:

```bash
python3 scripts/migrate-env.py
docker compose config --quiet
docker compose up --build -d --remove-orphans --wait
# Optional, if an export was made; MySQL application tables must be empty:
docker compose exec -T backend php /var/www/app/scripts/import-postgres.php < migration-data.json
```

The config migration is idempotent, prints no secrets, and saves the original as
`.env.before-php-mysql` with private permissions. Do not use
`docker compose down -v` when preserving data. Rollback uses the previous Git
revision, saved configuration and old PostgreSQL volume. Never mount a PostgreSQL
data directory into MySQL.

## Verification

After the containers are healthy:

```bash
sh scripts/verify.sh
```

This checks PHP syntax, Composer metadata, Apache/Nginx configuration and the
real application through Nginx. Integration checks cover registration, validation,
password hashes in MySQL, duplicate accounts, sessions, logout/replay, expiry,
file ownership, upload limits, receipt persistence, pagination, downloads and
concurrent collection. Temporary accounts, records and objects are removed in
`finally`. Run against the local Compose stack with host-reachable storage URLs.

Configuration migration tests need Python 3 only:

```bash
python3 -m unittest discover -s scripts/tests -v
```

The AWS SDK dependency is declared in `backend/composer.json`. A lock could not
be resolved in the restricted editing session, so the initial build resolves
compatible versions. Before freezing the submission, generate and commit the lock
on a connected machine, then rebuild:

```bash
docker compose run --rm --no-deps --entrypoint composer \
  -v "$PWD/backend:/work" -w /work backend update --no-dev --no-interaction
docker compose up --build -d --wait
```

## Behavior and API

PHP hashes passwords using bcrypt (cost 12). A random 256-bit session token goes
into an HttpOnly, SameSite=Lax `os_sid` cookie; only its SHA-256 hash is stored in
MySQL. Sessions last 24 hours. Login rotates the token and logout deletes it.
Expired sessions and deleted accounts are rejected. PDO prepared statements
handle user-controlled database values.

Uploads require a session, one multipart `file`, a `%PDF-` signature, and an
allowed size. The signature check does not establish that a PDF is harmless.
PHP stores the object with a UUID key and inserts its receipt in MySQL. Failed
inserts trigger a best-effort object deletion; failed cleanup is logged. MySQL
and S3 cannot share a transaction.

Listing returns the current user's records, cursor pagination, and availability.
Collection checks ownership, takes a per-file MySQL advisory lock, copies to
`downloaded/`, removes the live object, and returns a 60-second signed URL.
Issued URLs remain reusable until expiry, including after logout. The cleanup
worker sweeps every minute and deletes copies at least 120 seconds old. MySQL
receipts remain visible after collection.

| Method and path | Purpose |
|---|---|
| `GET /api/health` | PHP/MySQL readiness |
| `POST /api/auth/register` | JSON username/email/password; `{ user }`, 201 |
| `POST /api/auth/login` | JSON email/password; `{ user }` |
| `GET /api/auth/me` | Current user, or 401 |
| `POST /api/auth/logout` | JSON `{}`; clear session, 204 |
| `POST /api/files` | Multipart `file`; saved receipt, 201 |
| `GET /api/files?limit=20&before=<id>` | Files, nextCursor, maxUploadBytes |
| `GET /api/files/<key>/download` | url and expiresIn |

Errors return JSON `{ error }`. Database failures return a safe 500, missing
objects 404, rejected storage credentials 502, and unreachable storage 503.
Details stay in container logs.

## Submission documents

- [Lecturer's assignment](docs/ASSIGNMENT.md)
- [Written report](docs/REPORT.md)
- [Ubuntu setup and VM instructions](docs/UBUNTU-SETUP.md)
- [Demonstration and evidence checklist](docs/DEMONSTRATION.md)
- [Optional hosted image](deploy/vercel/README.md)

Fill in group details and actual practical results before submitting the report.
The supplied deadline is **the 26th**, with no month/year specified.
