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

## Roadmap / future work

- **Portfolio platform API:** the data model already separates curricula,
  capabilities, opportunities and logs, so a read/write REST API for portfolio
  platforms (e.g. Horus, Kaizen) can be added as an authenticated `/api/v1`
  surface with per-platform API keys.
- Trust Active Directory / LDAP single sign-on in place of local accounts.
- CSV import for bulk-loading curricula and capabilities.
- Email notifications (QA decisions, pending-approval reminders) via the
  Trust SMTP relay.
