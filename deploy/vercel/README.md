# Optional hosted PHP container

The classroom stack uses Compose on Ubuntu. `Dockerfile.vercel` is a separate
hosted image containing Nginx, Apache/PHP and a cleanup process. All HTTP requests
pass to Apache on loopback 8081. `vercel.json` selects the container deployment
configuration. MySQL and object storage are provided by external services.

Provision an external MySQL database and private S3-compatible bucket. Configure:

| Variable | Meaning |
|---|---|
| MYSQL_HOST / MYSQL_PORT | Managed MySQL endpoint and port |
| MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD | Application database credentials |
| MYSQL_SSL_CA | Optional path to provider CA file; enables verified database TLS |
| AWS_REGION / S3_BUCKET_NAME | Storage region and private bucket |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | Server-side storage credentials |
| S3_ENDPOINT | Optional S3-compatible endpoint; omit for AWS S3 |
| S3_PUBLIC_ENDPOINT | Browser-reachable storage URL if different |
| SESSION_COOKIE_SECURE | true for HTTPS browser access; hosted image default |
| MAX_UPLOAD_MB | 1–4 MB here; higher values are capped at 4 |
| PORT | Public HTTP port supplied by hosting runtime; default 80 |

Initialize the hosted database explicitly, using a private `.env.hosted` file:

```bash
docker build -f Dockerfile.vercel -t department-of-files-hosted .
docker run --rm --env-file .env.hosted department-of-files-hosted \
  php /var/www/app/scripts/init-database.php
```

The setup command leaves an existing complete schema unchanged and rejects a
partial schema. MySQL DDL is not transactional; review a partial setup before
retrying. Use an application database account with access to the configured
MySQL database.

Configure the host's environment, then build and deploy there. Check health,
registration, login, uploads and downloads through the actual HTTPS URL. Confirm
the cookie has Secure, HttpOnly and SameSite=Lax, and that storage URLs work in the
browser. Nginx permits a 4.25 MiB request body; PHP caps PDFs at 4 MiB. Platform
compatibility and its effective upload limit need verification before publishing.

The launcher supervises Apache, Nginx and cleanup and exits if a child exits.
Cleanup runs while the image is active. Sleeping platforms remove expired copies
on the next active sweep; an independent scheduled cleanup is needed for prompt
deletion while all web instances are asleep.
