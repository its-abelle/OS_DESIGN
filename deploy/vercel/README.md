# Deploy the complete web layer to Vercel

Vercel's Container runtime builds `Dockerfile.vercel` from the repository root.
The image runs Nginx (public port 80), Apache (loopback 8081) and Express (loopback
3000). PostgreSQL and S3-compatible storage must be hosted outside Vercel.
`compose.yaml` remains the five-container local classroom demonstration.

## Project settings

For the existing repository-connected project:

- Root Directory: repository root, **not** `frontend/public` or `backend`.
- Framework: Container, selected by `vercel.json` / `Dockerfile.vercel`.
- Clear any old custom Install Command, Build Command and Output Directory
  overrides intended for a static or Node-only deployment. The Dockerfile builds
  and starts the web layer.
- Leave `PORT` unset (default 80). Do not use 3000 or 8081 as the public port;
  those are reserved for internal services.
- Add the environment variables below for Production and any Preview deployments
  that should work. Changes require a new deployment.

## Runtime variables

| Variable | Required value |
|---|---|
| `DATABASE_URL` | Hosted PostgreSQL URL, with the provider's required TLS settings; a pooled URL is appropriate for multiple instances |
| `SESSION_SECRET` | A stable random secret of at least 32 characters |
| `AWS_REGION` | Region required by the bucket provider |
| `S3_BUCKET_NAME` | An existing private bucket |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials with the documented S3 permissions |
| `S3_ENDPOINT` | HTTPS API endpoint for non-AWS storage; **unset for Amazon S3** |
| `S3_PUBLIC_ENDPOINT` | HTTPS endpoint browsers can reach, if different from the storage API endpoint; otherwise unset |
| `MAX_UPLOAD_MB` | Optional, defaults to 4 in this image; the API always caps Vercel uploads at 4 MiB |

Never use Docker hostnames such as `database` / `minio` or `localhost` for hosted
services. The image sets `NODE_ENV=production` and `DEPLOYMENT_TARGET=vercel`.
Nginx preserves the edge's forwarded HTTPS protocol, and Express trusts only its
loopback proxy so session cookies remain Secure and HttpOnly. Provider credentials
are runtime environment variables; they are not Docker build arguments or files
copied into the image.

The Vercel Function request ceiling is 4.5 MB including multipart overhead.
The hosted cap is therefore 4 MiB; local Compose uploads retain their normal
configured/default 10 MiB limit. Supporting larger hosted files would require a
direct-upload protocol with server-side validation and metadata finalisation.

## Initialise a new hosted database

The application requires `users`, `files` and `session` before starting. With the
hosted `DATABASE_URL` supplied through a local **ignored** environment file, run:

```bash
nvm use
cd backend
node --env-file=../.env.vercel.local scripts/init-database.ts
```

The script creates the schema transactionally only when all three tables are
absent. If all three already exist it leaves them alone; a partial schema is
rejected for a reviewed migration. It does not reset existing data. The deployed
container also contains the script and schema, but does not automatically mutate
the hosted schema on startup.

## Deploy and verify

Push the configuration to the connected production branch. Alternatively, after
`vercel login` and linking this checkout to the existing project, use
`npx vercel@latest --prod` with a CLI version that supports the Container runtime.
Complete any required account authentication/2FA before linking or deploying.

Verify the deployment is Ready, then use its **HTTPS** URL to register, reload the
page, upload a PDF smaller than 4 MiB, inspect its database receipt, collect it,
and sign out. Verify a second account has an empty drawer and cannot retrieve
the first account's files. A successful static homepage alone does not verify
the backend, external database, session cookie or storage configuration.

Container instances scale down when idle. Download cleanup runs during active
instances and at startup, but is not an always-running scheduler while scaled to
zero. Configure a provider lifecycle rule for the `downloaded/` prefix if cleanup
must happen without further traffic. Signed URLs still expire after 60 seconds.

The on-page stack map describes the local Compose setup. The Vercel deployment
combines the three HTTP servers in one image and uses managed backing services.

Local verification of this image covered static assets through Nginx/Apache,
forwarded HTTPS with Secure session cookies, PostgreSQL sessions and metadata,
the enforced 4 MiB upload cap, S3 downloads, listing availability and logout.
The database initializer was checked against both a fresh isolated database and
an existing schema. These local checks do not replace verifying the actual Vercel
deployment with its hosted backing services after authentication is complete.

References: [Container runtime](https://vercel.com/docs/functions/runtimes/container),
[Compose migration](https://vercel.com/i/can-you-run-docker-compose-on-vercel),
[Function limits](https://vercel.com/docs/functions/limitations).
