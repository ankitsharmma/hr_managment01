# Delivery validation

Checked on 13 October 2026.

- Production React/Vite build: passed.
- Eight Node tests: passed, including the live MongoDB integration test; zero skipped in the full verification run.
- MongoDB used for integration verification: actual MongoDB 8.0.16 temporary test database.
- Express integration coverage: authentication, create/update persistence, role permission rejection, sequential approvals, stale version rejection, deletion guards, resume upload/extraction/download, calendar invite timestamps, complete interview/offer/hire flow, PDF response and idempotent employee conversion.
- Native React browser checks in Chromium: all 11 navigation pages rendered without JavaScript errors; employee, requisition and candidate save forms worked against the actual Express API and MongoDB. Reload preserved the saved requisition.
- Responsive browser check at 390 × 844: no page-level horizontal overflow. Wide tables scroll within their containers.
- Desktop/mobile screenshots were visually inspected during verification.
- Original demo records validate against the explicit Mongoose schemas.
- Dependency audit after patch updates: zero high/critical findings; three moderate findings remain in Mammoth's argparse/sprintf-js transitive dependency chain. The affected formatting code is not used directly by application request handlers.

Docker Desktop and the Windows batch launcher were not executed in this Linux verification environment. They use the same tested Node application/build and ship with compose configuration and prerequisite instructions.

`npm test` without MONGODB_TEST_URI skips the integration test by design. Set that variable to a dedicated `udata_test` database to reproduce live database checks. The test deletes only the supplied test database after enforcing that naming requirement. Do not use a production database.

Browser checks exercised normal navigation and save operations; they do not establish load capacity or production reliability. Automatic email sending, external calendar delivery, and OCR are not configured: offer/calendar files are downloadable, legacy DOC and scanned resumes require manual details.
