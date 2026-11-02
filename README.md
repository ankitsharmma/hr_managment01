# U-data HR — React + Express + MongoDB

This is a new MERN implementation of the uploaded `udata-hr-fixed (4).html` HR application. It contains real React JSX screens; the original HTML is included only as a reference and is not embedded or executed by the application.

## Quickest start: Docker (Windows / Mac / Linux)

Install Node.js 22+ and Docker Desktop. Run `node scripts/setup.mjs` once to create a private `.env` with a random JWT secret and admin password. On Windows, **START-DOCKER.bat** runs setup before starting Docker.

```sh
node scripts/setup.mjs
docker compose up --build -d
```

Open the address configured by `APP_HOST` and `APP_PORT` in `.env` (defaults: http://localhost:4000).

The first setup prints the generated admin credentials:

- Email: **admin@udata.local**
- Password: generated once and saved in `.env`

Change the password in **Account & settings** after signing in. Docker starts both Express and MongoDB; you do not need to install MongoDB separately. The first start needs internet to download dependencies and Docker images, and includes the original sample employees, requisitions and candidates.

Stop without deleting records:

```sh
docker compose down
```

Restart:

```sh
docker compose up -d
```

Records and resume files remain in the `mongodb_data` named volume. Do not use `docker compose down -v` unless you intend to erase the database.

To change the published address or port, edit `APP_HOST` / `APP_PORT` in `.env`, then restart the app.

## Start without Docker

Install **Node.js 22 or newer** and **MongoDB Community Server**. Start the MongoDB service with its default local port 27017. Extract the ZIP and double-click **START-WINDOWS.bat**. It creates `.env` if needed, installs packages, builds React and starts Express. Keep the terminal open while using the app.

The setup script prints a randomly generated admin password and saves it in `.env`. The email is `admin@udata.local`.

Mac/Linux:

```sh
bash start.sh
```

Manual commands from the project folder:

```sh
node scripts/setup.mjs
npm ci
npm run build
npm start
```

Open **http://localhost:4000**. A browser cannot run this project by opening index.html directly; Express and MongoDB need to run.

For development:

```sh
npm run dev
```

React: http://localhost:5173 · Express: http://localhost:4000 by default. Change `VITE_DEV_PORT`, `PORT`, or `VITE_API_PROXY_TARGET` in `.env` to adjust the development frontend/backend ports or proxy target.

Run both workspaces together with `npm run dev`, build the frontend with `npm run build`, and start the production server with `npm start`.

## Environment configuration

Run `node scripts/setup.mjs` to generate secure credentials and local defaults. For manual setup, copy `.env.example` to `.env` and replace both `replace-with` values. `.env` is ignored by Git and must never be committed. Existing `server/.env` files remain supported; the root `.env` takes precedence.

Common settings include:

| Setting | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string for local Node runs |
| `DOCKER_MONGODB_URI` | MongoDB connection string used by Docker Compose |
| `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Session signing key and first admin account |
| `HOST`, `PORT`, `APP_HOST`, `APP_PORT` | Backend bind address and published app address |
| `VITE_DEV_HOST`, `VITE_DEV_PORT`, `VITE_API_PROXY_TARGET` | Frontend development server and API proxy |
| `COOKIE_SECURE`, `SESSION_TTL_HOURS` | Secure-cookie mode and login duration |
| `JSON_BODY_LIMIT_MB`, `UPLOAD_MAX_SIZE_MB`, `EXTRACTED_TEXT_LIMIT` | Request, resume upload and extracted text limits |
| `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` | Login rate limit |
| `FEATURE_NOTIFICATIONS`, `FEATURE_REPORTS`, `FEATURE_RESUME_UPLOADS`, `FEATURE_STAFF_ACCOUNTS`, `FEATURE_DATA_BACKUP` | Optional module switches; disabled modules disappear from the UI and their APIs are not registered |
| `SEED_DEMO` | Add sample data when starting with an empty database |

Restart the server after changing `.env`. Frontend settings are supplied by the backend bootstrap response, so the UI stays in sync with feature switches. Employee, requisition, candidate, interview and other business data continue to be saved to MongoDB—not `.env`.

## Included modules

| Original module | New working behavior |
| --- | --- |
| Job Requisition | Create detailed requisitions, approval history, sequential HOD → Site Head → TA Head approvals, reset/revise, close/reopen, cancel/restore, guarded deletion |
| Candidates | Add/edit applications linked to live jobs, profile details, resume upload/download, text extraction, source/job/stage filters, CV sharing, shortlist/reject, bulk actions |
| Referred Candidates | Separate referral listing, referring-person field, same profile and workflow actions |
| Interview Pipeline | Stage board, profile access, constrained drag actions; schedule and complete rounds through profile workflows |
| Offers | Negotiated CTC, package approvals, actual offer PDF, TA Head letter approval, release timestamp, accepted/declined/no-show outcomes, hire conversion |
| All Employees | Add/edit/delete, salary, join date, status, reporting manager, employee creation from hired applications |
| Documents | Resume repository with authenticated downloads and external resume links |
| Org Chart | Department groups and saved reporting managers; cycle prevention in backend |
| My Requests | Manager requisitions and CVs awaiting review; linked manager accounts see only their assigned applications/requisitions |
| Approvals | Pending/decided requisitions and actionable approval tracks |
| Reports | Candidate funnel, source counts, offer outcomes, no-shows, requisition metrics, date filters and CSV export |

Also included: workspace search, collapsible navigation, responsive layouts, staff logins, password changes, JSON backup with resume bytes, and an empty-database import script.

## Try a complete recruitment workflow

1. Use the supplied live Product Designer job, or raise a new requisition.
2. In Details & approvals, approve HOD, then Site Head, then TA Head. An admin can test all three roles. Individual approvers can act only on their assigned step.
3. Add a candidate or referral. Upload a resume if needed and save the profile.
4. Open the candidate → Workflow. Share the CV with a manager or shortlist directly.
5. Open Interviews. Schedule Round 1, then submit feedback with Proceed and scores 1–5.
6. Schedule optional Round 2 / Round 3 or go to Final Round. Complete the Final Round with Selected, Hold or Rejected.
7. For Selected candidates, open Workflow. Submit CTC and complete all three package approvals.
8. Generate the offer letter, download its PDF and approve the letter as TA Head/admin.
9. Release the offer. Download/send the PDF yourself; release is a recorded action and does not automatically email anyone.
10. Record Accepted, then Mark hired. Check All Employees for the new employee.

Interview calendar files encode Asia/Kolkata times into UTC. Calendar downloads create an ICS file; they do not send invitations.

## Roles and persistence

Create users in **Account & settings** as admin. Available roles: admin, recruiter, manager, hod, siteHead and taHead. A manager account must link to a People Repository employee. Decisions record the signed-in user's identity; free-text approver names cannot bypass approval roles.

MongoDB collections:

- employees: people profiles, salary, status, manager link, hired candidate link.
- jobs: requisition fields, recruiter assignment and embedded approval track.
- candidates: applications, education, CV review, interview rounds/scorecards, offer approvals/outcomes and activity history.
- uploads: resume bytes and extracted text stored in MongoDB.
- users: staff accounts with bcrypt password hashes.

Records use stable string IDs plus optimistic `version` numbers. A stale update returns 409 rather than overwriting a newer save. Deleting a requisition with candidates is blocked. Employee deletion is blocked while login/reporting/recruiter dependencies exist. Hiring creates an idempotent employee record; Sync employee record repairs a failed employee write without duplicating it.

Resumes: PDF, DOCX, DOC, TXT up to 8 MB. PDF and DOCX text extraction supports basic name/email/phone autofill. Always verify the extracted values. Legacy DOC files are stored but need conversion to DOCX for extraction. Image/scanned PDFs without text need manual entry. Match score is a simple keyword overlap, not an AI suitability assessment. Uploaded documents are stored in MongoDB, not browser storage.

## Existing data / JSON recovery

Your source HTML contains sample data and depends on `window.storage`. The sample data is included. Live records from the old storage are not embedded in that file and cannot be recovered from HTML alone.

To import a compatible JSON containing `employees`, `jobs`, `candidates` and optionally `uploads`:

1. Use a new empty MongoDB database and set `SEED_DEMO=false` in `.env` before starting it.
2. Run from the project folder:

```sh
node scripts/import-data.mjs path/to/backup.json
```

The import refuses to run against an existing populated HR database. Old inline base64 resumes are converted to uploads. Old `On Hold` / `Shortlisted` stages are mapped to the new workflow. It validates records before writes, but standalone MongoDB imports are not cross-collection transactions; keep the source backup if a connection fails partway through.

Docker JSON import:

```sh
docker compose cp backup.json app:/app/backup.json
docker compose exec app node /app/scripts/import-data.mjs /app/backup.json
```

Use a fresh database and `SEED_DEMO=false` for this flow too. Staff login accounts are not included in the UI JSON backup. For full recovery including users, use MongoDB's native backup:

```sh
docker compose exec mongodb mongodump --db udata_hr --archive=/tmp/udata_hr.archive --gzip
docker compose cp mongodb:/tmp/udata_hr.archive ./udata_hr.archive
```

To restore into an empty instance:

```sh
docker compose cp ./udata_hr.archive mongodb:/tmp/udata_hr.archive
docker compose exec mongodb mongorestore --archive=/tmp/udata_hr.archive --gzip
```

## Common startup problems

- `node` / `npm` not found: install Node.js and reopen your terminal.
- Docker cannot connect: open Docker Desktop and wait until the engine is running.
- Docker reports missing `JWT_SECRET` or `ADMIN_PASSWORD`: run `node scripts/setup.mjs`, then run Docker Compose again.
- MongoDB connection error: start MongoDB, or choose Docker. For Atlas, put your own MONGODB_URI in `.env`.
- Invalid secret: run `node scripts/setup.mjs` before the first start. If .env already exists, set JWT_SECRET to at least 32 random characters.
- Duplicate job code/email: choose a unique value.
- Record changed: Refresh, reopen the profile and save again.
- Approval buttons missing: sign in as the assigned approver/admin and complete earlier steps.
- Startup port already in use: stop the old app and change `PORT` or `APP_PORT` in `.env`.

## Hosting

The supplied Docker setup binds to localhost for local use. Before public deployment, use your own JWT_SECRET and initial admin password, HTTPS, `COOKIE_SECURE=true`, and private/authenticated MongoDB networking. Do not publish `.env` or expose MongoDB directly. Configure an HTTPS reverse proxy to preserve the request host/protocol for same-origin validation. Font downloads are optional; the UI uses local fallback fonts without them.

### Separate Vercel frontend and Render API

1. Create a MongoDB Atlas database and allow connections from your Render service.
2. In Render, create a **Web Service** from this repository with the repository root as the root directory. Use build command `npm ci && npm run build` and start command `npm start`.
3. Add these Render environment variables: `NODE_ENV=production`, `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, and `SEED_DEMO=false` (or `true` to load demo records).
4. In Vercel, import the same repository with its root directory as the project root. The included `vercel.json` builds and serves `client/dist`. Set `VITE_API_BASE_URL` to the Render service's HTTPS URL, without a trailing slash, then deploy.
5. Add the deployed Vercel origin (currently `https://hr-managment01-dpy5.vercel.app`) to Render's `FRONTEND_URLS`, then redeploy the API.

The frontend and API are separate deployments, but the browser must accept the API's cross-site session cookie. Some browsers block third-party cookies; using custom frontend and API domains under the same site (for example, `hr.example.com` and `api.example.com`) avoids relying on third-party-cookie access. Never put server secrets in Vercel frontend environment variables.

## Project structure

- client/src/App.jsx: React workspace screens and page orchestration.
- client/src/components/ui.jsx: reusable forms, tables, dialogs and approval controls.
- client/src/shared/: frontend API client and shared HR workflow constants.
- client/src/styles.css: responsive plum theme.
- server/src/config.js: validated environment settings and feature switches.
- server/src/app.js: Express middleware, API assembly and centralized error handling.
- server/src/routes/: authentication, notifications and reporting endpoints.
- server/src/models.js: Mongoose schemas.
- server/src/workflow.js: server workflow rules.
- server/src/index.js: MongoDB connection and startup seed.
- scripts/setup.mjs: local configuration creation.
- scripts/import-data.mjs: empty-database data import.
- reference/original.html: supplied source retained for comparison.
