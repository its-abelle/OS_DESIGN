# Department of Files — COSC 428

A small PHP/MySQL application for registering accounts, uploading PDFs and
collecting your own files. Use this guide to set it up and demonstrate the
assignment.

```text
Ubuntu VM → Docker → Nginx → Apache/PHP → MySQL + MinIO
```

## 1. Set up the Ubuntu VM

1. Install [VirtualBox](https://www.virtualbox.org/wiki/Downloads) on your computer.
2. Download an [Ubuntu Desktop LTS ISO](https://ubuntu.com/download/desktop).
3. Create a VM called `COSC428-Ubuntu`. Suggested resources: 4 CPUs, 8 GB RAM and
   a 40 GB disk. Attach the Ubuntu ISO and keep NAT networking enabled.
4. Start the VM, install Ubuntu, create a user and log in.
5. Open **Terminal inside the VM**. Run the remaining commands there and use the
   VM's browser to view the frontend. [Ubuntu's VM walkthrough](https://ubuntu.com/tutorials/how-to-run-ubuntu-desktop-on-a-virtual-machine-using-virtualbox)

You can also run the project on Ubuntu already installed on your computer.
Demonstrating virtualisation requires running it inside the VM.

## 2. Install the tools

On a new Ubuntu installation:

```bash
sudo apt update
sudo apt install -y git python3 curl nano
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

If Docker and Compose already work, keep that installation and skip installing
`docker.io` and `docker-compose-v2`. Ubuntu provides the [Compose package](https://packages.ubuntu.com/search?keywords=docker-compose-v2).

**Log out of Ubuntu and log in again** so Docker permissions take effect. Check:

```bash
docker run --rm hello-world
docker compose version
```

## 3. Get and start the project

```bash
git clone https://github.com/its-abelle/OS_DESIGN.git
cd OS_DESIGN
cp .env.example .env
nano .env
```

In `.env`, replace `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` and
`AWS_SECRET_ACCESS_KEY` with three different passwords of at least 16 characters.
Keep the other settings for testing in the VM's browser. Save and close the file.
If you already have the project and a configured `.env`, keep them and run these
commands from the project folder:

```bash
docker compose config --quiet
docker compose up --build -d --remove-orphans --wait
docker compose ps
```

The first build needs internet access and may take several minutes. The five
services are `frontend` (Nginx), `backend` (Apache/PHP), `database` (MySQL),
`minio` (PDF storage) and `cleanup` (expired downloads and sessions).

## 4. Open and use the frontend

Open **http://localhost:8080** in the Ubuntu VM's browser.

1. Create an account, then sign out and sign in again.
2. Choose a small PDF and select **File this PDF**.
3. Expand **Database receipt** and note the file ID and owner ID.
4. Select **Collect PDF** and check the downloaded file. Its receipt stays visible.
5. Create another account and confirm it cannot see the first account's files.

To use your computer's browser outside the VM, forward VirtualBox host ports
8080 and 9100 to the same guest ports. Then open `http://localhost:8080` on that
computer. For another computer on the network, use bridged VM networking and set
`S3_PUBLIC_ENDPOINT=http://<Ubuntu-IP>:9100` in `.env` before starting the stack.

## 5. Test each assignment requirement

Run these commands from the project folder inside Ubuntu:

| Requirement | What to do | What to show |
|---|---|---|
| Virtualisation | Run `systemd-detect-virt` inside the VM | VM settings, Ubuntu guest desktop, and detected hypervisor such as `oracle` or `kvm` |
| Containerisation | Run `docker compose ps` | Five running services; backend and database healthy |
| Nginx configuration | Run `docker compose exec frontend nginx -t` | Successful configuration check |
| Apache configuration | Run `docker compose exec backend apache2ctl -t` | `Syntax OK` |
| PHP application | Run `docker compose exec backend php -v`, then register and upload through the GUI | PHP version and functioning frontend |
| Database integration | Run `curl --fail http://localhost:8080/api/health`, then inspect MySQL below | Health response naming PHP/MySQL and rows matching the GUI |

Inspect the database:

```bash
docker compose exec database sh -c 'exec mysql -u "$MYSQL_USER" -p "$MYSQL_DATABASE"'
```

Enter `MYSQL_PASSWORD` from `.env` at the prompt, then run:

```sql
SELECT id, username, email FROM users;
SELECT id, original_filename, uploaded_by, size_bytes FROM files;
exit;
```

Match the file ID and owner ID with the GUI receipt. To test persistence, run
`docker compose restart backend`, wait for it to become healthy, then refresh
the frontend. Your account and receipts should remain.

For automated checks, run:

```bash
sh scripts/verify.sh
```

This checks PHP and web-server configuration, registration, sessions, private
uploads, MySQL records and downloads. It removes its temporary test accounts and
files. Save successful output and screenshots as evidence; test results must come
from running the commands.

## 6. Stop, troubleshoot and submit

- **Stop:** `docker compose down`. Data volumes remain; avoid adding `-v`.
- **See errors:** `docker compose logs --tail=50 backend database frontend`.
- **Docker permission denied:** log out and back in after joining the Docker group.
- **Directory listing or wrong page:** use port **8080**, rebuild with
  `docker compose up --build -d --remove-orphans --force-recreate --wait`.
- **Download fails:** check the browser can reach `S3_PUBLIC_ENDPOINT`.
- **Changed `.env`:** run `docker compose up -d --force-recreate backend cleanup frontend`.

Complete the group details and attach your results to the [report](docs/REPORT.md).
Include evidence for all six checks above. The supplied deadline is **the 26th**;
confirm the month and submission details with the lecturer.
