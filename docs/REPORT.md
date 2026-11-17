# COSC 428 — Group Practical Report

**Title:** Virtualisation, Containerisation and Web Application Deployment

**Application:** Department of Files

**Group:** [Enter group name/number]

**Members and registration numbers:** [Enter members]

**Lecturer:** [Enter lecturer]

**Submission date:** [Enter date; supplied deadline is the 26th]

## 1. Overview and objectives

This project implements a small PHP/MySQL web application in Docker on Ubuntu.
Users register, sign in, upload PDFs and collect their own files. The interface
shows database receipts so that an upload can be traced from the browser to a
stored relational record. Nginx acts as the public reverse proxy and Apache
executes PHP inside the backend container. MinIO stores the PDF bytes.

The objectives are to configure the operating environment and web servers,
develop an interactive PHP application, connect it to MySQL, link the services,
and demonstrate successful database communication.

The deployment described in this report uses Ubuntu directly as the Docker
host. The accompanying environment guide includes an Ubuntu guest VM procedure.
Runtime verification is recorded separately in [VALIDATION.md](VALIDATION.md).

## 2. Architecture and technology choices

| Layer | Implementation | Responsibility |
|---|---|---|
| Operating environment | Existing Ubuntu host | Runs Docker and provides terminal/browser access |
| Orchestration | Docker Compose | Builds the backend, creates the network and persistent volumes |
| Public web server | Nginx | Receives HTTP on 8080, enforces body limit and forwards to Apache |
| Backend web server | Apache with PHP 8.4 | Renders the PHP GUI, executes API handlers and serves assets |
| Database | MySQL 8.4 | Stores accounts, session token hashes and file metadata |
| Object storage | MinIO | Holds private PDFs and accepts signed download requests |
| Background worker | PHP cleanup process | Removes expired download copies and sessions |

```text
Browser ──8080──> Nginx ──backend:80──> Apache/PHP
                                          ├──database:3306──> MySQL
                                          └──minio:9000─────> MinIO
Browser <──── signed URL, host port 9100 ──────────────────────┘
```

Compose's default bridge network resolves service names. Browser-visible ports
are 8080 for the application and 9100 for object downloads. The MinIO console is
bound to host loopback 9101. MySQL is reached internally, without a host port.
`mysql_data` and `minio_data` preserve state across container recreation.

Containers share the Ubuntu host kernel and isolate the application services.
An Ubuntu guest VM can host the same Compose stack using the procedure in the
environment guide.

## 3. Task 1 — Environment setup

The group uses the Ubuntu installation already available on its machine.
Record its version, CPU architecture and network address using `/etc/os-release`,
`uname -m` and `hostname -I`. Ubuntu Terminal is the command interface; a browser
is the graphical application interface. SSH can provide remote terminal access.

Docker Engine and the Compose plugin are installed using Docker's official
Ubuntu package repository when not already available. The installation process,
verification commands and optional VM procedure are included in
[UBUNTU-SETUP.md](UBUNTU-SETUP.md). Verify `docker version`,
`docker compose version`, and the `hello-world` container before deployment.

For a new checkout, copy `.env.example` to `.env`, set different application,
root-database and storage passwords, and configure the browser-reachable storage
endpoint. Start with:

```bash
docker compose config --quiet
docker compose up --build -d --remove-orphans --wait
docker compose ps
```

The `.env` file separates application database credentials, database
administration credentials, session-cookie settings and storage configuration.
Persistent named volumes store MySQL data and PDF objects independently of the
container lifecycle.

Environment evidence consists of the Ubuntu version, Docker/Compose versions,
service status and browser access. VM settings and guest login are documented
separately if the VM procedure is carried out.

## 4. Task 2 — Nginx and Apache configuration

Nginx listens on container port 80, published as host 8080. Its template forwards
all requests to `http://backend:80`, preserves the public Host header, and sets
forwarded client/protocol headers. The body limit is the configured PDF maximum
plus multipart overhead. This gives one browser origin for pages and API calls.

The backend image extends the official Apache/PHP image. It enables Apache's
rewrite module and adds PHP's PDO MySQL extension. The base image also provides
SimpleXML, mbstring and cURL for application/storage access. PHP source and dependencies
live in `/var/www/app`, outside Apache's public document root. Only the PHP page,
API entry point and frontend assets are copied to `/var/www/html`.

Apache renders `index.php` and rewrites `/api/...` to `api.php`. The PHP startup
script applies upload settings and checks the MySQL tables and storage
bucket before starting Apache. Compose waits for the backend's health check
before starting Nginx and cleanup.

Verification commands:

```bash
docker compose exec -T frontend nginx -t
docker compose exec -T backend apache2ctl -t
curl --fail http://localhost:8080/api/health
```

**Evidence to attach:** Successful server checks, the Nginx route configuration,
Apache configuration and the health response.

## 5. Task 3 — PHP graphical application

The GUI is rendered by PHP and styled with local CSS, fonts and
icons. JavaScript provides interactive calls to the PHP API. PHP supplies the
configured upload limit to the initial page. The interface provides registration,
login/logout, PDF selection/drop, upload progress, a private file drawer,
pagination, receipt details and collection/download controls.

PHP validates registration input, hashes passwords with bcrypt at cost 12, and
verifies those hashes at login. A new random 256-bit token is issued on login or
registration; MySQL stores only its SHA-256 hash. The cookie is HttpOnly,
SameSite=Lax and optionally Secure for HTTPS, with a 24-hour expiry. Logout
deletes the server-side record. Expired sessions and deleted accounts are denied.

For uploads, PHP validates authentication, actual file size and the `%PDF-`
signature. It derives the owner from the session, ignoring client-supplied owner,
size and MIME fields. A UUID identifies the storage object. A failed database
insert triggers best-effort deletion of the newly stored object.

Listings are filtered by the authenticated user and paginated by record ID.
Download requests check MySQL ownership before storage operations. A MySQL
per-file advisory lock serialises collection. The object is copied to
`downloaded/`, removed from the live area and given a 60-second signed URL.
The cleanup worker removes copies at least 120 seconds old during its next sweep;
database receipts remain. An issued link is reusable during its validity period.

**Evidence to attach:** Registration/login, uploaded PDF, receipt panel, another
user's empty/private drawer, successful collection and retained receipt.

## 6. Task 4 — MySQL integration

Compose runs MySQL 8.4 and creates the database named by `MYSQL_DATABASE`. On a
new volume, MySQL executes `db/init.sql`. An application account is used by PHP;
the root credential is confined to database administration. PHP connects through
PDO to `database:3306`, with UTF-8, exception handling and native prepared
statements. Timestamps use UTC.

| Table | Key fields | Purpose |
|---|---|---|
| users | id, username, email, password_hash, created_at | Accounts with unique usernames/emails |
| files | id, original_filename, s3_key, mime_type, size_bytes, uploaded_by, created_at | PDF metadata and owner relationship |
| sessions | token_hash, user_id, expires_at | Database-backed login sessions |

Foreign keys connect `files.uploaded_by` and `sessions.user_id` to `users.id`.
An index on file owner and ID supports private pagination. Expiry is indexed for
session cleanup. Username comparisons remain case-sensitive; emails are
normalised to lowercase. PDF bytes reside in MinIO rather than in MySQL.

Demonstrate the PHP/database link by registering a uniquely named demo account,
uploading a PDF, opening its receipt, then inspecting matching rows:

```bash
docker compose exec database sh -c 'exec mysql -u "$MYSQL_USER" -p "$MYSQL_DATABASE"'
```

Enter the application database password at the prompt, then run:

```sql
SELECT id, username, email, created_at FROM users ORDER BY id DESC LIMIT 5;
SELECT id, original_filename, size_bytes, uploaded_by, s3_key
FROM files ORDER BY id DESC LIMIT 5;
SELECT user_id, expires_at FROM sessions ORDER BY expires_at DESC LIMIT 5;
```

Compare the file ID, owner ID, key and byte count with the GUI receipt. Restart
the backend, refresh and show that the rows and account session remain usable.
Do not include passwords, cookie tokens, storage keys used as credentials, or
password hashes in submitted screenshots.

## 7. Verification and expected results

`scripts/verify.sh` validates Compose configuration, PHP syntax, Composer metadata,
Apache/Nginx configuration and the HTTP/MySQL/MinIO integration workflow. The
Python integration runner creates temporary accounts and removes their rows and
objects after testing. The procedure and recorded verification status are in
[VALIDATION.md](VALIDATION.md).

| Operation | Implemented behavior | Demonstration evidence |
|---|---|---|
| Service readiness | PHP checks MySQL tables and storage access before serving requests | Healthy services and `/api/health` response |
| Registration | Validates input, stores a bcrypt hash and creates a session | Account row and signed-in GUI |
| Authentication | Verifies passwords, rotates login tokens and rejects expired/deleted sessions | Login, logout and rejected private request |
| PDF upload | Stores PDF bytes and records validated metadata in MySQL | Upload response and matching database receipt |
| Private file listing | Filters records by account and paginates by ID | Separate account drawers and paginated results |
| Collection | Checks ownership and issues a 60-second signed download link | Downloaded PDF and retained receipt |
| Concurrent collection | Serialises storage operations with a MySQL advisory lock | Integration test output |
| Persistence | Stores records, sessions and objects outside container lifecycles | Backend restart followed by refresh |

These describe the implementation and expected outcomes. Attach dated test
output and screenshots from the running environment to establish observed
results. [DEMONSTRATION.md](DEMONSTRATION.md) provides the presentation sequence.

## 8. Operational considerations

MySQL and object storage are separate systems. Upload compensation attempts to
remove an object when its metadata cannot be saved. Interrupted or uncertain
network operations can require manual reconciliation. PDF signature validation
checks the file header; it does not scan documents for malware.

The local setup uses HTTP and `SESSION_COOKIE_SECURE=false`. An HTTPS deployment
uses Secure cookies and verified database TLS when required by its provider.
Browser downloads depend on a reachable `S3_PUBLIC_ENDPOINT`. A Composer lock
file records dependency versions for reproducible builds.

The deployment uses native Ubuntu. The separate VM instructions describe how to
run the stack inside a guest OS; a completed VM demonstration requires evidence
from that guest environment.

## 9. Conclusion

Department of Files uses Apache/PHP behind Nginx and stores accounts, sessions
and file metadata in MySQL. Docker Compose connects the services on Ubuntu and
persistent volumes retain their data. The PHP GUI, private file operations,
database receipts and verification workflow provide a practical basis for
explaining web server configuration, container networking and database
integration.

## References

- [Assignment brief supplied by the group](ASSIGNMENT.md).
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
- [Ubuntu VirtualBox walkthrough](https://ubuntu.com/tutorials/how-to-run-ubuntu-desktop-on-a-virtual-machine-using-virtualbox).
- [Official PHP container image](https://hub.docker.com/_/php).
- [PHP PDO MySQL driver](https://www.php.net/manual/en/ref.pdo-mysql.php).
- [AWS SDK for PHP S3 signed URLs](https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/s3-presigned-url.html).
