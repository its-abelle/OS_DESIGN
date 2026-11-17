# PHP/MySQL migration validation record

Recorded during implementation on 17 November 2026. These results concern the
checks listed here, not a successful running PHP deployment.

| Check | Result |
|---|---|
| `python3 -m unittest discover -s scripts/tests -v` | Passed: 5 configuration migration tests |
| Python compilation of configuration/export/integration scripts | Passed |
| `node --check frontend/public/app.js` | Passed |
| `bash -n deploy/vercel/start.sh` | Passed |
| `sh -n` for backend startup, Nginx startup, upload-limit and verification scripts | Passed |
| Compose YAML structure review | Passed; expected five services and MySQL/backend health dependencies |
| `docker compose config --quiet` with migrated local `.env` | Passed |
| `git diff --check` | Passed before commit |
| `docker compose build backend` | Blocked: Docker daemon socket access denied |
| PHP syntax, Composer dependency resolution and lock generation | Not run: no PHP runtime or terminal network access |
| `sh scripts/verify.sh` runtime integration workflow | Pending on group's Ubuntu machine |
| Hosted image build/deployment | Pending; no deployment performed |
| VM installation/demonstration | Not performed; instructions supplied only |

The local configuration migration completed and retained its ignored private
backup. No old PostgreSQL container/volume was changed and no database rows were
transferred during this session. Optional transfer tools are provided for use
before replacing the old container.

Run the documented verification workflow on Ubuntu and add its dated results and
evidence to the report. The report must retain accurate pending entries for any
remaining unperformed practical checks.
