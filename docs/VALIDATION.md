# Application validation

## Automated verification

Start the application on Ubuntu using the root README, then run:

```bash
sh scripts/verify.sh
```

The script validates Compose configuration, PHP syntax, Composer metadata, Apache
configuration and Nginx configuration before running the integration checks.
The integration runner uses the application through `http://localhost:8080` and
queries MySQL through the backend container to compare stored records with API
responses. Its temporary accounts, file records and storage objects are removed
after the checks.

## Verification coverage

| Area | Checks |
|---|---|
| PHP GUI and readiness | Page is rendered, PHP source is not returned, health endpoint connects to MySQL |
| Input validation | Malformed JSON, incorrect content types and invalid registration data are rejected |
| Accounts | Registration signs in, duplicate accounts are rejected and stored password hashes verify |
| Sessions | Cookies carry HttpOnly/SameSite attributes, login rotates tokens, logout prevents replay, expiry is enforced |
| Access control | Anonymous requests, cross-site requests and another user's download requests are rejected |
| Uploads | Content signature and size are checked; client-supplied metadata cannot override server values |
| Database receipts | API receipt matches the stored MySQL record |
| Listing | Files are private to the account, ordered by ID and paginated correctly |
| Downloads | Signed link returns original PDF bytes; collected files cannot receive another successful collection link |
| Concurrency | Simultaneous collection requests issue at most one successful link |
| Account deletion | Removing an account invalidates its session access |

## Recorded verification status

| Check | Status |
|---|---|
| Compose configuration validation | Passed |
| Frontend JavaScript syntax | Passed |
| Startup and verification shell syntax | Passed |
| Runtime PHP, Apache, MySQL and MinIO integration | Test procedure provided; successful run not yet recorded |
| Backend restart persistence | Manual demonstration procedure provided; result not yet recorded |
| Hosted deployment | Verification procedure provided; result not yet recorded |

Record the date, environment, command output and any failures when executing the
runtime checks. A feature's implementation describes its code behavior; successful
runtime verification requires a recorded run against the deployed services.

## Manual demonstration

Use [DEMONSTRATION.md](DEMONSTRATION.md) to capture the GUI, matching database
rows, file collection and persistence after a backend restart. A VM deployment
also needs guest settings, guest login and services running inside the guest.
The report describes the native Ubuntu deployment.

Keep credentials and session tokens out of screenshots and test evidence.
