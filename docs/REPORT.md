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

**Status at preparation:** The group reports an existing Ubuntu installation.
The repository has been migrated from Express/PostgreSQL to PHP/MySQL. The
editing session could not run PHP, access Docker, or resolve package downloads,
so the migrated runtime has not yet been demonstrated. Results requiring a
running stack are explicitly pending below. Earlier Express tests are not
claimed as results for PHP. VM setup is documented as instructions only, at the
group's request; no VM completion is claimed.

## 2. Architecture and technology choices

| Layer | Implementation | Responsibility |
|---|---|---|
| Operating environment | Existing Ubuntu host | Runs Docker and provides terminal/browser access |
| Virtual machine | Setup instructions supplied | Separate guest environment required by the brief; not demonstrated |
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

Containers share the host kernel; a VM provides a separate guest OS. Docker
services on native Ubuntu establish containerisation and service integration,
but do not prove the separate virtual machine requirement.

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

For the existing checkout, the configuration migration script preserves the
original in a private ignored backup. MySQL uses a new volume. Optional export
and import scripts transfer PostgreSQL account and file rows without altering
the old database volume or MinIO objects. Previous sessions are deliberately
invalidated and users sign in again.

**Evidence to attach:** Actual Ubuntu version, Docker/Compose versions, service
status, chosen access interface, and (if carried out) VM configuration and guest
login. No VM was installed as part of this implementation work.

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
script applies upload settings and checks the existing MySQL tables and storage
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

The GUI is rendered by PHP and styled with the existing local CSS, fonts and
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

## 7. Verification and results

`scripts/verify.sh` checks PHP syntax, Composer metadata, Apache/Nginx configuration
and a real HTTP/MySQL/MinIO integration workflow. The Python integration runner
creates isolated temporary accounts and removes their rows and objects afterward.
Configuration migration has separate tests using Python's standard library.
The recorded editing-session checks are in [VALIDATION.md](VALIDATION.md).

| Check | Expected result | Recorded result |
|---|---|---|
| Configuration migration | Original preserved, credentials retained, idempotent rerun | 5 configuration migration tests passed in editing session |
| PHP syntax and dependency resolution | Syntax passes and SDK installs | Pending on Ubuntu with Docker |
| Nginx/Apache configuration | Both checks succeed | Pending |
| Registration and MySQL write | Account exists with a verified password hash | Pending |
| Login/logout/session expiry | Correct access and rejection responses | Pending |
| PDF upload and receipt | MySQL metadata matches response/GUI | Pending |
| Ownership and pagination | Only caller's records accessible | Pending |
| Collection and signed download | Original bytes returned; another collection rejected | Pending |
| Concurrent collection | At most one successful link issuance | Pending |
| Backend restart | Records and valid session survive | Pending manual demonstration |
| VM practical | Ubuntu guest runs linked Docker stack | Instructions supplied; not performed |

Replace pending entries with actual outputs, dates and screenshot references
after running the practical. Do not replace them solely because configuration
files exist. [DEMONSTRATION.md](DEMONSTRATION.md) lists the evidence to capture.

## 8. Limitations and remaining submission work

The runtime build and end-to-end checks need execution on the group's Ubuntu
machine. Composer's lock file must be generated on a connected machine to freeze
transitive dependencies. Existing PostgreSQL records need the optional transfer
if the group wants them in the new database. The report needs member details and
actual demonstration evidence before submission.

The group requested direct use of existing Ubuntu and VM instructions only.
Consequently, the VM deliverable remains unproven. A lecturer-approved exception
or an actual VM demonstration is needed to close that requirement.

MySQL and object storage are separate systems. Compensating cleanup cannot cover
all crashes or uncertain network outcomes; orphaned objects may need manual
reconciliation. The application validates PDF signatures but does not scan PDFs
for malware. Local HTTP is intended for the classroom setup; hosted access should
use HTTPS and verified database TLS where required by its provider.

## 9. Conclusion

The repository now implements the specified PHP/MySQL architecture, with Apache
in the backend container behind Nginx. The application demonstrates the intended
data flow through account and file operations, subject to the pending runtime
checks. Ubuntu host instructions, a separate VM procedure, and a repeatable
demonstration plan support completion of the practical and report evidence.

## References

- [Assignment brief supplied by the group](ASSIGNMENT.md).
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
- [Ubuntu VirtualBox walkthrough](https://ubuntu.com/tutorials/how-to-run-ubuntu-desktop-on-a-virtual-machine-using-virtualbox).
- [Official PHP container image](https://hub.docker.com/_/php).
- [PHP PDO MySQL driver](https://www.php.net/manual/en/ref.pdo-mysql.php).
- [AWS SDK for PHP S3 signed URLs](https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/s3-presigned-url.html).
