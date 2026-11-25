# COSC 428: Group Practical Report

## Virtualisation, Containerisation and Web Application Deployment

**Project:** Department of Files  
**Report date:** 25 November 2026  
**Submission:** Written report and practical demonstration  
**Deadline:** 26th, as stated in the assignment brief

### Group members

| No. | Name | Registration number |
|---|---|---|
| 1 | KHATORO LUTOMIA | EB1/66796/23 |
| 2 | MARION MATARA | EB1/66839/23 |
| 3 | BOBBE CHEDA | EB1/66783/23 |
| 4 | THIONG’O AUGUSTINE | EB1/66801/23 |
| 5 | MICHAEL KARIUKI | EB1/66877/23 |
| 6 | DENZEL OTIENO | EB1/66818/23 |
| 7 | ANN MUTHONI | EB1/61299/22 |
| 8 | ERIC NGURE | EB1/66800/23 |
| 9 | DELUXE SANDE | EBS1/69128/23 |
| 10 | WANJIRU KAMAU | EB1/46564/20 |
| 11 | LINUS BOIWO | EB1/66858/23 |
| 12 | DAVID NYABERO MOMANYI | EB1/66903/23 |

## 1. Introduction

This project demonstrates an integrated virtualised environment for a PHP and
MySQL web application. The implementation combines an Ubuntu virtual machine,
Docker containers, Nginx, Apache and a browser-based graphical user interface.
The application, Department of Files, allows users to create accounts, sign in,
upload private PDF documents, search their records and collect their files.

An Azure virtual machine provides the virtualised Ubuntu environment. Docker
runs inside the Ubuntu guest. Terraform automates VM and network provisioning,
while Caddy provides HTTPS. Azure is the VM hosting platform, and these deployment
additions support the assignment tasks. Nginx, Apache, PHP and MySQL provide the
required web server, GUI and database functionality.

The report documents the actual configuration, implementation, deployment
problems and verified results. Evidence consists of configuration excerpts,
command outputs and automated checks performed on the deployed environment.

### 1.1 Objectives

The objectives were to:

1. Configure an Ubuntu VM and an interface for administering the environment.
2. Install Docker and connect application services through Docker Compose.
3. Configure Nginx as a reverse proxy and Apache inside the PHP backend container.
4. Develop a functional PHP-rendered GUI for account and document operations.
5. Create a MySQL database and demonstrate communication with PHP.
6. Link the environment components and verify an end-to-end application workflow.

## 2. Environment and System Architecture

### 2.1 Verified deployment environment

The following information was collected from the running Azure VM on
25 November 2026. VM size and disk allocation also appear in the Terraform
configuration.

| Component | Configuration or observed version |
|---|---|
| Virtual machine | Azure `Standard_B2als_v2`, x86-64, 2 vCPUs, 4 GB RAM |
| Azure region | South Africa North (`southafricanorth`) |
| Guest operating system | Ubuntu 24.04.5 LTS |
| Virtualisation detection | `systemd-detect-virt` returned `microsoft` |
| Allocated OS disk | 32 GB, `Standard_LRS`; guest root filesystem reported 30 GB |
| Observed memory | 3906 MiB total guest RAM |
| Docker Engine | 29.1.3 |
| Docker Compose | 2.40.3 |
| PHP | 8.4.28 |
| Apache | 2.4.71, Debian-based backend image |
| Nginx | 1.30.8 |
| MySQL | 8.4.13 |
| Application database | `appdb` |

Ubuntu is the Docker host operating system. The containers use their respective
application images; they do not need to use the same user-space distribution
as the host.

### 2.2 Linked services

The base Compose configuration defines five services. The Azure configuration
adds Caddy, giving six running containers in the deployed environment.

| Service | Responsibility | Connection to other components |
|---|---|---|
| `caddy` | Public HTTPS entry point and certificate management | Forwards application traffic to Nginx and signed storage requests to MinIO |
| `frontend` | Nginx reverse proxy and request-size enforcement | Forwards application requests to `backend:80` |
| `backend` | Apache and PHP GUI/API | Connects to `database:3306` and `minio:9000` |
| `database` | MySQL account, session and file-record persistence | Serves PHP requests over the private Docker network |
| `minio` | Private PDF object storage | Accepts backend uploads and serves authorised signed downloads |
| `cleanup` | Background PHP maintenance process | Removes expired sessions and expired temporary download copies |

The request and data paths are:

```text
Browser
   |
   | HTTPS :443
   v
Caddy -> Nginx -> Apache/PHP -> MySQL
                     |
                     +------> MinIO

Browser -- signed HTTPS download :9443 --> Caddy --> MinIO

Cleanup worker --------------------------> MySQL and MinIO
```

Docker Compose creates the application network and resolves service names such
as `backend`, `database` and `minio`. These names allow the containers to
communicate without hard-coded container IP addresses.

The deployed application address is:

<https://department-files-546375be.southafricanorth.cloudapp.azure.com>

## 3. Task 1: Development Environment Setup

### 3.1 Provisioning the virtual machine and Ubuntu

Terraform defines the resource group, virtual network, subnet, network security
group, public IP address, network interface, security-group association and
Linux VM. The deployment uses Canonical's Ubuntu 24.04 LTS server image.
Azure manages the underlying virtualisation platform, while the project manages
the Ubuntu guest and its containers.

The network security group permits public TCP traffic on ports 80, 443 and 9443.
Port 80 supports HTTPS certificate validation and redirection. Port 443 serves
the application, and port 9443 serves signed PDF downloads. SSH on port 22 is
restricted to the administrator's public IPv4 address using a `/32` CIDR rule.
Password-based SSH authentication is disabled.

Azure CLI provides subscription access and VM administration. The VM is
configured for SSH access using a dedicated public key. Azure Run Command was
used to inspect startup logs, repair the initial deployment and execute the
recorded verification checks. Users access the application through a browser.

The provisioning sequence included:

```bash
az login --use-device-code
az provider register --namespace Microsoft.Compute --wait
az provider register --namespace Microsoft.Network --wait
terraform init
terraform validate
terraform plan -out=azure.tfplan
terraform apply azure.tfplan
```

Subscription-specific values, including the SSH source CIDR, belong in a local
`terraform.tfvars` file. The project excludes this file, Terraform state and
saved plans from version control. The deployment guide explains the complete
preparation procedure.

### 3.2 Installing Docker and obtaining the application

Cloud-init installs the required Ubuntu packages, including `docker.io`,
`docker-compose-v2`, Git, OpenSSL and curl. The bootstrap enables the Docker
service, clones the public project repository and checks out a pinned commit.
Pinning the source revision makes the application version explicit.

The bootstrap generates separate random passwords for the application database
account, the MySQL root account and MinIO. It stores configuration in a
root-readable `.env` file with mode `0600`. Rerunning setup preserves an existing
non-empty `.env`, which avoids changing credentials while reusing database
volumes.

The deployment starts the stack with the base and Azure Compose files:

```bash
docker compose -f compose.yaml -f compose.azure.yaml config --quiet
docker compose -f compose.yaml -f compose.azure.yaml up --build -d --wait
```

The Azure override removes the base configuration's directly published Nginx and
MinIO ports. Caddy becomes the public entry point. Restart policies allow the
services to start again after the Docker daemon or VM restarts.

### 3.3 Distinguishing the VM and containers

The Ubuntu guest provides the machine environment in which Docker operates.
Containers separate the web proxy, application, database, storage and maintenance
processes while sharing the guest's kernel. This demonstrates both machine
virtualisation and application containerisation rather than treating the two as
the same technology.

## 4. Task 2: Web Server Configuration

### 4.1 Nginx frontend

Nginx runs in the `frontend` container. Its configuration listens on container
port 80 and forwards requests to Apache/PHP using the Compose service name:

```nginx
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
location / { proxy_pass http://backend:80; }
```

The frontend entrypoint derives the request-body limit from `MAX_UPLOAD_MB`,
allowing an additional megabyte for multipart overhead. With the configured
10 MB file limit, Nginx permits an 11 MB request body. PHP and application-level
checks also enforce upload limits.

### 4.2 Apache and PHP backend

The backend Dockerfile builds from `php:8.4-apache-bookworm`. It enables Apache's
rewrite module, installs the PDO MySQL extension, verifies required PHP
extensions and installs the AWS S3 SDK through Composer.

Apache serves the public GUI and assets from `/var/www/html`. Application
classes, maintenance scripts and Composer dependencies reside under
`/var/www/app`, outside the public document root. The configuration sets
`index.php` as the directory index, disables directory listing and sends API
paths to the PHP API entry script:

```apache
DirectoryIndex index.php
RewriteEngine On
RewriteRule ^api(?:/.*)?$ /api.php [END,QSA]
```

The startup script configures PHP upload limits, disables displayed errors and
checks database tables and object storage before starting Apache.

### 4.3 HTTPS deployment

Caddy runs in front of Nginx on Azure. It obtains and manages HTTPS certificates
and forwards application requests to `frontend:80`. A second HTTPS listener on
port 9443 forwards storage requests to `minio:9000`.

A separate storage port allows both endpoints to use the VM's Azure DNS name
without another domain or public IP. The proxy retains the request host and
storage path required by S3 signed URLs. MySQL and the MinIO administration
console are not exposed through public host ports.

## 5. Task 3: PHP Graphical User Interface

### 5.1 Implemented interface

PHP renders the initial HTML page. CSS defines the layout, and JavaScript calls
the PHP API to update application state without full page reloads. The interface
contains:

- Sign-in and account-registration forms with labelled inputs.
- Password visibility control and validation feedback.
- A dashboard showing the authenticated user's file records.
- A filename search field and a combined file-list toolbar.
- Previous/Next navigation with ten records per page.
- A PDF upload panel supporting file selection and drag-and-drop.
- A collection action and an expandable database receipt for each record.
- Success notifications that close after five seconds; errors remain visible.

The interface retains a green-and-yellow identity and reuses folder illustrations
on the authentication and dashboard screens. Layout rules adapt the toolbar,
file rows and panels for smaller viewports. Form labels, keyboard focus styles,
status announcements and reduced-motion rules support accessibility.

CSS and JavaScript URLs include content hashes. This ensures changed page
markup loads matching assets instead of reusing incompatible cached versions.

### 5.2 User workflow

A user registers with a username, email address and password, or signs in with
an existing account. The session grants access to that user's records. The user
selects a PDF and submits it; PHP validates the request, stores its bytes in
MinIO and inserts its metadata in MySQL. The dashboard then displays the record.

Search performs a case-insensitive filename substring match on the server.
Pagination uses a record-ID cursor, ordered from newest to oldest. Search remains
active between pages, and a new search returns to the first page. An empty search
result receives a distinct message from an account that has no uploaded files.

### 5.3 File collection behaviour

The current implementation uses one-time collection. Selecting **Collect PDF**
authorises the request, copies the object to a temporary `downloaded/` location,
removes the original object and issues a signed URL valid for 60 seconds. The
browser starts the download and displays a retry link during that period.
The database receipt remains available after collection.

The cleanup worker runs every 60 seconds and removes temporary copies that are
at least 120 seconds old. Collection removes the original when the link is
issued; it does not wait for confirmation that the browser saved the PDF.
This behaviour is a current application limitation, not a requirement imposed by
MySQL, MinIO or the assignment brief.

## 6. Task 4: MySQL Database Integration

### 6.1 Database creation and schema

The MySQL container uses `MYSQL_DATABASE` to create `appdb` and sets up the
application account using environment variables. The Compose configuration
mounts `db/init.sql` into MySQL's initialisation directory to create the tables
on the first initialisation of an empty data directory.

| Table | Important fields | Purpose |
|---|---|---|
| `users` | `id`, `username`, `email`, `password_hash`, `created_at` | Stores account identity and password hashes |
| `sessions` | `token_hash`, `user_id`, `expires_at` | Associates expiring authenticated sessions with users |
| `files` | `id`, `original_filename`, `s3_key`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at` | Stores document metadata, ownership and storage references |

The schema enforces unique usernames and email addresses. Foreign keys connect
file and session records to users. An index on `(uploaded_by, id)` supports
owner-scoped, cursor-paginated file listing.

PDF bytes reside in MinIO; MySQL stores their metadata and ownership. MySQL
therefore remains essential to account management, authentication and document
access rather than serving as an unused secondary component.

### 6.2 PHP-to-MySQL communication

The PHP `Database` class establishes a PDO connection using the private Compose
hostname `database` and port 3306. It uses the application account, enables
exceptions, disables emulated prepared statements and sets the connection time
zone to UTC.

Database operations use prepared statements. For example, file collection first
checks that the storage key belongs to the signed-in user:

```sql
SELECT id FROM files WHERE s3_key = ? AND uploaded_by = ?;
```

Passwords are stored as bcrypt hashes. PHP generates random session tokens,
stores their SHA-256 hashes in MySQL and sets the browser cookie with HttpOnly
and SameSite attributes. The Azure configuration also enables Secure cookies.
Logging out removes the corresponding session, and expired sessions cannot
access protected endpoints.

### 6.3 Demonstrating database integration

The deployed database returned:

```text
database_name
appdb

Tables_in_appdb
files
sessions
users
```

The application health endpoint returned HTTP 200 with:

```json
{"status":"ok","application":"PHP","database":"MySQL"}
```

The integration test additionally uploaded a PDF, queried its MySQL record and
compared the API receipt with the stored file ID, owner ID and storage key. It
verified that the password hash could authenticate the test account and differed
from the original password. These checks demonstrate actual communication
between PHP and MySQL, beyond successful connection configuration alone.

## 7. Verification and Results

### 7.1 Environment and server checks

Commands executed against the deployed environment included:

```bash
systemd-detect-virt
docker --version
docker compose version
docker ps
```

The running deployment contained all six services. MySQL and the PHP backend
reported healthy status; the other containers were running. The server checks
returned:

```text
Apache: Syntax OK
Nginx: configuration file syntax is ok
Nginx: configuration file test is successful
Composer: composer.json is valid
```

Composer also reported a non-blocking warning that the package has no licence
field. PHP syntax checks passed for the application classes, maintenance scripts
and public PHP entry files.

### 7.2 End-to-end application checks

The project's `scripts/verify.sh` was executed on the Azure VM with
`TEST_BASE_URL` set to the public HTTPS application URL. The recorded run passed
all of its integration checks. It created temporary accounts and objects and
removed them after the test.

| Test area | Observed result |
|---|---|
| GUI delivery | PHP page served successfully through the proxy chain |
| Asset consistency | CSS/JavaScript content versions matched the served files |
| Database connection | Health endpoint identified PHP and MySQL and returned HTTP 200 |
| Registration and authentication | Valid registration and login passed; invalid and duplicate accounts were rejected |
| Password storage | Stored hash verified correctly and was not the plaintext password |
| Session control | Login rotated the token; logout and expiry invalidated access |
| Request validation | Malformed JSON, incorrect content types and cross-site requests were rejected |
| Upload validation | Invalid PDF headers and oversized uploads were rejected |
| Record integrity | API receipts matched MySQL records and spoofed ownership metadata was ignored |
| Ownership isolation | Another account could not list or collect a user's file |
| Search | Case-insensitive matching passed; wildcard characters were treated literally; invalid parameters were rejected |
| Pagination | Results remained owner-scoped, correctly ordered and filtered across pages |
| Download | Signed URL returned the original PDF bytes over the deployed storage endpoint |
| One-time collection | A collected file could not receive another link; its MySQL receipt remained |
| Concurrent collection | Concurrent requests issued exactly one collection link |

The final verification output was:

```text
Integration checks passed; temporary accounts, rows and objects removed.
```

### 7.3 Deployment configuration checks

Terraform formatting and validation passed. A read-only plan against the Azure
subscription proposed eight resources, and the user then applied the deployment.
Two mocked Terraform tests checked SSH/firewall restrictions and the cloud-init
payload size without provisioning additional resources.

Bootstrap tests checked shell syntax, private service ports and the handling of
credentials. A regression test cloned the application using the bootstrap's
permission settings and confirmed that SQL/PHP files were readable by container
users while generated `.env` files retained mode `0600`. Caddy configuration
validation also passed.

## 8. Problems Encountered and Resolutions

### 8.1 Reused database credentials during local setup

An existing MySQL volume retained the original template passwords after the
local `.env` was updated. MySQL's environment settings initialise a new database;
they do not automatically update accounts in an existing volume. Updating the
saved MySQL accounts to match the configured credentials restored the health
check without deleting the database.

### 8.2 Azure region, VM-size and provider restrictions

The student subscription allowed only selected deployment regions. The initial
`Standard_B2s` size was unavailable for the subscription in South Africa North.
A read-only SKU check identified `Standard_B2als_v2` as an eligible 2-vCPU,
4-GB x64 alternative.

An initial apply created the resource group but failed to create network
resources because `Microsoft.Network` was not registered. Registering the
Network and Compute providers and generating a fresh Terraform plan allowed
deployment to continue using the existing state.

### 8.3 Container file permissions during cloud bootstrap

The first bootstrap used `umask 077` before cloning the repository. This created
source files that container users could not read. MySQL logged permission denied
for `init.sql`; the application schema was missing, the PHP backend could not
become ready, and the web proxy remained stopped. The browser consequently
reported connection refused.

The repair made tracked source files and directories accessible to their
container users, kept `.env` private, initialised the schema only after checking
that the application database was empty, and rebuilt the containers. The
permanent bootstrap fix uses `umask 022` for cloning and switches to `umask 077`
before writing credentials. A regression test reproduced the original failure
and passed after the correction. The repaired HTTPS page and API both returned
HTTP 200, followed by a successful cloud integration run.

### 8.4 Cached frontend assets

After a UI update, a browser loaded new HTML with older cached CSS and
JavaScript. The old script referenced removed elements and caused an error.
Adding content hashes to asset URLs ensured each page loads the matching asset
versions. The integration suite now verifies those hashes.

## 9. Persistence, Limitations and Maintenance

Named Docker volumes retain MySQL data, MinIO objects and Caddy certificate
state across container restarts. On Azure, these volumes and `.env` reside on
the VM's managed OS disk. Replacing or destroying that VM can delete the disk
and its application data. Backups are therefore necessary before destructive
infrastructure changes. This deployment does not provide high availability or
automated backup recovery.

The current collection workflow supports temporary, one-time retrieval rather
than permanent repeat downloads. Its PDF-header and size checks do not amount
to full document parsing or malware inspection. The recorded tests establish
functional behaviour; they are not performance or load-test results.

The selected VM, disk and public IP may consume Azure student credit. Azure for
Students made the deployment accessible, but this report does not claim that
the running configuration is permanently free.

## 10. Assessment of Expected Deliverables

| Assignment deliverable | Implementation and evidence |
|---|---|
| Functional virtualised environment | Running Azure Ubuntu VM; virtualisation detected as `microsoft` |
| Docker environment running on Ubuntu | Verified Docker/Compose installation and six running deployment containers |
| Working web server configuration | Nginx-to-Apache request path, successful server syntax checks and public HTTPS responses |
| Simple PHP graphical user interface | PHP-rendered registration, sign-in, dashboard, upload, search and collection interface |
| MySQL connected to PHP | `appdb` tables, PDO connection, successful health response and record-level integration checks |
| All environments linked | Browser-to-proxy-to-PHP requests, database operations and signed PDF downloads verified end to end |
| Written report | This document records setup, configuration, implementation, faults and observed results |

## 11. Conclusion

The project established an Ubuntu virtual machine running a linked,
containerised PHP/MySQL web application. Nginx forwards requests to Apache,
PHP renders the GUI and processes application operations, MySQL stores account
and document records, and MinIO stores the associated PDF bytes. Caddy adds
HTTPS access to the cloud deployment.

The live verification results demonstrate registration, authentication, database
communication, private uploads, filename search, pagination and authorised PDF
retrieval. Resolving provider-registration, credential, file-permission and
asset-caching problems also demonstrated the importance of separating
infrastructure readiness from application readiness. The completed environment
provides a practical demonstration of the virtualisation, containerisation, web
server and database-integration tasks in the assignment brief.

## 12. Project Configuration References

- [Repository and setup guide](../README.md)
- [Base Docker Compose services](../compose.yaml)
- [Backend Dockerfile](../backend/Dockerfile)
- [Apache configuration](../backend/apache.conf)
- [Nginx configuration template](../frontend/templates/default.conf.template)
- [PHP GUI](../frontend/public/index.php)
- [PHP application/API](../backend/src/App.php)
- [PDO database connection](../backend/src/Database.php)
- [MySQL schema](../db/init.sql)
- [Object storage and temporary downloads](../backend/src/Storage.php)
- [Maintenance worker](../backend/scripts/cleanup.php)
- [Verification script](../scripts/verify.sh)
- [Integration tests](../backend/tests/integration.py)
- [Azure Terraform deployment guide](../infra/azure/README.md)
- [Azure infrastructure configuration](../infra/azure/main.tf)
- [Azure HTTPS proxy configuration](../infra/azure/Caddyfile)
