# Curriculum Mapping Tool

A browser-based curriculum mapping tool for NHS teaching hospitals. It maps
learning opportunities across the Trust against medical education curricula —
from undergraduate (UKMLA) through Foundation, core/higher specialty training
to consultant-level CPD — so that:

- **Trainees** log portfolio evidence against curriculum capabilities, see
  their gaps at a glance, and find QA-approved learning that fills them.
- **Educators** submit learning opportunities through a structured form and
  map each one to the capabilities it helps meet, across any curriculum.
- **QA reviewers** approve or reject submissions (with feedback) before they
  become visible to trainees; any edit returns an opportunity to the queue.
- **Managers** see a Trust-wide provision report: which capabilities in each
  curriculum have no approved learning opportunity.
- **Admins** approve account registrations, assign roles, and maintain the
  curriculum frameworks through the UI.

## Stack

- **Backend:** Node.js (≥ 22.5) + Express, with SQLite via the built-in
  `node:sqlite` module — no native build step, the whole database is one file
  (`data/app.db`).
- **Frontend:** React 18 + Vite, served as static files by the same Express
  process in production. One process, one port.
- **Auth:** local accounts (bcrypt-hashed passwords, signed session cookies).
  New registrations are `pending` until an admin approves them.

## Running it

```bash
npm run setup     # install server + client dependencies
npm run build     # build the React frontend into client/dist
npm start         # serve app + API on http://localhost:3001 (PORT env to change)
```

For development, run `npm run dev` in the root (API on :3001) and `npm run dev`
in `client/` (Vite dev server on :5173, proxying `/api`).

On first start the database is created and seeded with sample curricula,
opportunities and demo accounts (all passwords `demo1234`):

| Email | Role |
|---|---|
| admin@demo.nhs.uk | Admin |
| educator@demo.nhs.uk | Educator |
| manager@demo.nhs.uk | Manager |
| qa@demo.nhs.uk | QA reviewer |
| trainee@demo.nhs.uk | Trainee (enrolled on IMT sample, partial portfolio) |

To reset everything, stop the server and delete the `data/` directory.

> **Important:** the seeded curriculum content (UKMLA, Foundation Programme,
> IMT, GMC GPCs) is an **abridged sample** for demonstration. Before real use,
> enter the full frameworks from the official published curricula via
> *Admin → Curricula*, and remove or re-password the demo accounts via
> *Admin → Users*.

## Deployment notes for Trust IT

- Needs only Node.js ≥ 22.5 on an internal Windows or Linux server; no
  external database, no internet access at runtime.
- Run `npm run setup && npm run build` once, then keep `npm start` running as
  a service (e.g. NSSM on Windows, systemd on Linux). Set `PORT` as needed.
- Serve behind the Trust's reverse proxy with HTTPS. Session cookies are
  `httpOnly` + `SameSite=Lax`; set `SESSION_SECRET` in the environment for
  managed secret rotation (otherwise one is generated and stored in `data/`).
- Back up the `data/` directory (SQLite database + session secret).

## Deploying to Railway

The repo ships with a `Dockerfile` and `railway.json`, so Railway builds and
runs the app with no extra configuration. Two things are essential:

1. **A persistent volume** — Railway's container filesystem is wiped on every
   redeploy. Without a volume your SQLite database (all users, opportunities,
   logs) and session secret are lost each deploy.
2. **An EU region + demo data only** — see the information-governance note
   below before putting any real personal data on a public cloud.

### Steps

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, and pick this repo.
   Railway detects the `Dockerfile` and builds it automatically.
3. **Add a volume:** open the service → **Variables/Settings → Volumes →
   New Volume**, mount path **`/data`**. The Dockerfile already sets
   `DATA_DIR=/data`, so the database and session secret persist there.
   (If you mount elsewhere, set the `DATA_DIR` variable to match.)
4. **Set environment variables** on the service:
   - `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`).
   - `NODE_ENV` is already `production` from the Dockerfile.
   Railway injects `PORT` automatically; the server already honours it.
5. **Generate a domain:** service → **Settings → Networking → Generate Domain**.
6. On first boot the database seeds the demo accounts (password `demo1234`).
   **Immediately sign in as `admin@demo.nhs.uk` and disable or re-password the
   demo accounts** via *Admin → Users* — they are public-internet-accessible.

Alternatively, with the Railway CLI: `railway init`, then `railway up`, then
add the volume and variables in the dashboard as above.

> **Information governance:** Railway is a US-headquartered public cloud.
> Hosting real trainee data (names, emails, portfolio reflections — all
> personal data) there has DSPT and UK GDPR data-residency implications that
> need IG sign-off and, at minimum, an EU region. This is fine for a
> demo/pilot using the seeded sample data; it is **not** a substitute for the
> internal Trust hosting described above for production use.

## Roadmap / future work

- **Portfolio platform API:** the data model already separates curricula,
  capabilities, opportunities and logs, so a read/write REST API for portfolio
  platforms (e.g. Horus, Kaizen) can be added as an authenticated `/api/v1`
  surface with per-platform API keys.
- Trust Active Directory / LDAP single sign-on in place of local accounts.
- CSV import for bulk-loading curricula and capabilities.
- Email notifications (QA decisions, pending-approval reminders) via the
  Trust SMTP relay.
