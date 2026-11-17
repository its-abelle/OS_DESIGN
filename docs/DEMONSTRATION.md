# Practical demonstration and evidence

Run from the repository root on the group's Ubuntu machine. Keep passwords,
API credentials and cookie values out of screenshots. Do not screenshot a fully
rendered `docker compose config` or `.env`; use `config --quiet` for validation.

## Preparation

1. Check Docker Engine and the Compose plugin on Ubuntu.
2. Copy `.env.example` to `.env` if needed and set the database and storage
   passwords. Keep an already configured `.env` when rebuilding.
3. Set `S3_PUBLIC_ENDPOINT` for the browser that will run the demonstration.
4. Run `docker compose up --build -d --remove-orphans --wait`.
5. Run `sh scripts/verify.sh` and save the actual output.
6. Record dependency versions in `backend/composer.lock` using the README's
   dependency command, then rebuild when those versions change.

## Demonstration sequence

| Step | Action | Evidence |
|---|---|---|
| 1 | Show Ubuntu version and login/terminal interface | 01-ubuntu.png |
| 2 | Show Docker/Compose versions and healthy services | 02-docker.png |
| 3 | Show Nginx and Apache successful configuration checks | 03-servers.png |
| 4 | Visit `/api/health` through port 8080 | 04-php-mysql-health.png |
| 5 | Register a demo account and sign in | 05-account.png |
| 6 | Upload a small PDF; expand its database receipt | 06-upload-receipt.png |
| 7 | Query MySQL and match file/owner/key/size fields | 07-mysql-row.png |
| 8 | Sign in as another user; show separate records | 08-private-drawer.png |
| 9 | Collect the first user's PDF; show downloaded bytes/file | 09-download.png |
| 10 | Refresh and show receipt retained, file unavailable | 10-receipt-retained.png |
| 11 | Upload another PDF, restart backend, refresh while signed in | 11-persistence.png |
| 12 | Sign out and show the private workspace is inaccessible | 12-logout.png |

To demonstrate persistence:

```bash
docker compose restart backend
# Wait for backend health before refreshing. Nginx may need a restart if a
# container was recreated with a new internal IP rather than merely restarted.
docker compose ps
```

Optional direct database inspection (interactive password prompt):

```bash
docker compose exec database sh -c 'exec mysql -u "$MYSQL_USER" -p "$MYSQL_DATABASE"'
```

If a VM is actually used, also capture its resource/network settings, guest
Ubuntu login/version, and Docker running inside the guest. The native Ubuntu
deployment is documented without a guest VM layer.

## Troubleshooting

- **MySQL unhealthy:** inspect `docker compose logs database`; verify the `.env`
  credentials match the credentials used when its volume was first initialized.
  Changing `.env` does not change an existing MySQL account password.
- **Backend startup fails:** inspect `docker compose logs backend`. It checks
  tables and bucket access before starting Apache; it does not silently rebuild
  an existing schema.
- **Upload gets 413:** check `MAX_UPLOAD_MB` and restart/recreate services after
  changes. The hosted image has a separate 4 MB file cap.
- **Login immediately disappears:** Secure cookies require browser HTTPS. Use
  `SESSION_COOKIE_SECURE=false` for the local HTTP demonstration.
- **Download URL fails:** the browser must resolve and reach `S3_PUBLIC_ENDPOINT`.
  Do not use Docker's internal `minio` hostname as the browser endpoint.
- **Nginx 502 after backend recreation:** restart `frontend` to refresh its
  upstream DNS resolution: `docker compose restart frontend`.

## Final report pass

Fill in group details, actual test output/date, screenshot references, host
versions and the deployment environment. Record results from the demonstrated
stack and leave unperformed checks clearly identified. Submit the report
together with the practical demonstration by the confirmed deadline.
