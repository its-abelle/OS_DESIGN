# COSC 428 — Group Practical Report

**Title:** Virtualisation, Containerisation and Web Application Deployment

**Application:** Department of Files

**Group and members:** [Add names and registration numbers]

**Lecturer and submission date:** [Add details]

## Purpose

The application lets users register, sign in, upload PDFs and collect their own
files. It demonstrates virtualisation, Docker containers, Nginx and Apache
configuration, PHP application development and MySQL integration.

## Implementation

| Component | Role |
|---|---|
| Ubuntu | Operating system hosting Docker; can run inside a VirtualBox VM |
| Docker Compose | Connects and starts five services |
| Nginx (`frontend`) | Accepts browser requests on port 8080 and forwards them to Apache |
| Apache/PHP (`backend`) | Renders the GUI and handles account and file requests |
| MySQL (`database`) | Stores users, sessions and file metadata |
| MinIO (`minio`) | Stores private PDF bytes and serves signed downloads |
| PHP worker (`cleanup`) | Removes expired download copies and sessions |

```text
Browser → Nginx → Apache/PHP → MySQL
                            → MinIO → Browser download
```

PHP connects to MySQL using PDO prepared statements. The `users` table stores
accounts and bcrypt password hashes. The `sessions` table stores session-token
hashes and expiry times. The `files` table stores filenames, storage keys, sizes,
owners and timestamps. Foreign keys link sessions and files to users.

Uploads require authentication and validate the PDF header and file size. Users
can only list and collect their own files. Collection issues a 60-second signed
URL, removes the live PDF and retains its MySQL receipt. Named volumes preserve
MySQL records and MinIO objects across container restarts.

## Setup and demonstration

Follow the [README](../README.md) for VM installation, Docker setup, application
startup, browser access and checks for each assignment requirement.

**Environment used:** [Record Ubuntu version, VM software/resources if used,
Docker version and Compose version. Specify whether Ubuntu ran inside a VM or
directly on the computer.]

## Results and evidence

Fill this table using actual command output and screenshots from the practical.

| Requirement | Evidence to attach | Observed result |
|---|---|---|
| Virtualisation | VM settings, guest desktop and `systemd-detect-virt` output | [Record result] |
| Containerisation | `docker compose ps` showing the five services | [Record result] |
| Web server configuration | Nginx and Apache successful configuration checks | [Record result] |
| PHP application | PHP version, registration, upload and collection screenshots | [Record result] |
| Database integration | Health response and MySQL rows matching the receipt | [Record result] |
| Linked environments and persistence | End-to-end download and receipts after backend restart | [Record result] |

**Automated verification:** [Attach dated output from `sh scripts/verify.sh`.]

**Conclusion:** [Summarise the observed results and any requirement not
successfully demonstrated.]
