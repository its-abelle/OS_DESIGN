# File workspace UI implementation plan

**Goal:** Simplify sign-in and the dashboard, retain the green-and-yellow identity, and add filename search and pagination.

**Architecture:** Keep the PHP page, vanilla JavaScript and existing owner-scoped API. Reuse local fonts, SVG icons and folder illustrations. No new dependencies or schema changes.

- [x] Center the auth form, add the existing folder illustration, and remove slogans, eyebrow labels and decorative badges.
- [x] Use a dashboard heading, a primary file list and a separate upload panel; keep filename search and Refresh in one toolbar row.
- [x] Connect the toolbar upload button directly to the native file picker; keep collection labels on one line.
- [x] Dismiss success notices after five seconds, cancel stale dismissal timers, and keep errors visible.
- [x] Version CSS and JavaScript URLs with content hashes to prevent stale assets from breaking updated markup.
- [x] Add validated, parameterized, case-insensitive filename search scoped to the signed-in account.
- [x] Show ten files per page with cursor-based Previous/Next controls; preserve search across pages and reset it for a new query.
- [x] Verify JavaScript behavior, DOM references, PHP/Composer/web-server configuration and the integration suite.

**Validation:** `node frontend/tests/ui.test.cjs`, `sh scripts/verify.sh`, JavaScript syntax and `git diff --check` pass. Integration checks cover asset hashes, search privacy and validation, literal wildcard characters, pagination, authentication, uploads and collection. Browser visual and keyboard checks were unavailable.

**Existing behavior retained:** Collection issues a short-lived download link and removes the original from storage. This change does not alter that lifecycle.
