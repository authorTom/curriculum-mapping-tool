# Curriculum Mapping Tool

> A fork of [apassey-droid/Curriculum-Mapping-Tool](https://github.com/apassey-droid/Curriculum-Mapping-Tool),
> packaged for container deployment. All of the application design and clinical
> education work is theirs; this fork adds a hardened Docker image, a Compose
> stack and automated multi-arch publishing to GitHub Container Registry.

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
  (`app.db`).
- **Frontend:** React 18 + Vite, served as static files by the same Express
  process in production. One process, one port.
- **Auth:** local accounts (bcrypt-hashed passwords, signed session cookies).
  New registrations are `pending` until an admin approves them.

## Run it

### With Docker (recommended)

```bash
docker compose up -d
```

Then open <http://localhost:8080>. The image is built and published
automatically to GitHub Container Registry on every push to `main`, for both
`amd64` and `arm64`.

On an empty database the app creates a single admin account and prints its
generated password once, to the log:

```bash
docker compose logs web | grep -A1 "first admin"
```

Sign in with it and change the password when prompted — the account is flagged
`must_change_password`. To choose the credentials yourself instead, copy the
environment template first:

```bash
cp .env.example .env    # set ADMIN_EMAIL and ADMIN_PASSWORD, port, SMTP, ...
docker compose up -d
```

Without Compose, the equivalent is:

```bash
docker run -d --name curriculum-mapping-tool \
  -p 8080:8080 \
  -v cmt-data:/data \
  -e ADMIN_EMAIL=you@yourtrust.nhs.uk \
  -e ADMIN_PASSWORD='choose-something-long' \
  ghcr.io/authortom/curriculum-mapping-tool:latest
```

To build the image from source instead of pulling it, uncomment the `build:`
block in [`compose.yaml`](compose.yaml) and run `docker compose up -d --build`.

The image runs as the unprivileged `node` user (uid 1000), declares a
healthcheck on `/api/health`, and keeps all state in the `/data` volume.

### Trying it with the sample data

The repo ships an abridged sample of curriculum content plus five demo accounts
that all share the published password `demo1234`. These are **off by default in
the container** — a published instance should never boot with known
credentials. To load them on a throwaway evaluation instance:

```bash
CMT_SEED_DEMO=true docker compose up -d
```

| Email | Role |
|---|---|
| admin@demo.nhs.uk | Admin |
| educator@demo.nhs.uk | Educator |
| manager@demo.nhs.uk | Manager |
| qa@demo.nhs.uk | QA reviewer |
| trainee@demo.nhs.uk | Trainee (enrolled on IMT sample, partial portfolio) |

> **Important:** the seeded curriculum content (UKMLA, Foundation Programme,
> IMT, GMC GPCs) is an **abridged sample** for demonstration. Before real use,
> enter the full frameworks from the official published curricula via
> *Admin → Curricula*, and remove or re-password the demo accounts via
> *Admin → Users*.

### Development server

Requires **Node 22.5 or newer** — the app uses Node's built-in `node:sqlite`,
so there is no native module to compile.

```bash
npm run setup     # install server + client dependencies
npm run build     # build the React frontend into client/dist
npm start         # serve app + API on http://localhost:3001
```

For hot reload, run `npm run dev` in the root (API on :3001) and `npm run dev`
in `client/` (Vite dev server on :5173, proxying `/api`). Data goes to `./data/`
(gitignored) rather than a Docker volume, and demo seeding is **on** by default
for a source checkout.

You can also run the dev environment in a container, with no local Node at all:

```bash
docker compose --profile dev up dev     # -> http://localhost:5173
```

To reset everything, stop the server and delete the `data/` directory (or
`docker compose down -v` for the container).

## Configuration

Every setting is an environment variable with a sensible default, so an
unconfigured container still runs correctly.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` (Docker), `3001` (dev) | Port the server listens on |
| `DATA_DIR` | `/data` (Docker), `./data` (dev) | Where `app.db` and the session secret live |
| `ADMIN_EMAIL` | `admin@localhost` | Email of the admin created on an empty database |
| `ADMIN_PASSWORD` | *(generated)* | Its password; generated and logged once if unset |
| `SESSION_SECRET` | *(generated)* | Signs the session cookie; persisted in `DATA_DIR` if unset |
| `SECURE_COOKIES` | `auto` | `Secure` cookie flag — see below |
| `CMT_SEED_DEMO` | `false` (Docker), `true` (dev) | Load the sample curricula and demo accounts |
| `SMTP_HOST` | *(unset)* | SMTP relay; without it, notifications are logged instead |
| `SMTP_PORT` | `587` | `465` for implicit TLS |
| `SMTP_SECURE` | `false` | Force implicit TLS |
| `SMTP_USER` / `SMTP_PASS` | *(unset)* | SMTP credentials, if the relay needs them |
| `MAIL_FROM` | `Curriculum Mapping Tool <no-reply@localhost>` | Sender shown to recipients |
| `APP_URL` | *(unset)* | Linked at the foot of outgoing emails |

See [`.env.example`](.env.example) for the annotated version.

## Deploying behind a proxy

Serve this behind the Trust's reverse proxy with HTTPS. Session cookies are
`httpOnly` and `SameSite=Lax`, and are marked `Secure` automatically whenever
the request arrives over HTTPS — which works as long as your proxy sets
`X-Forwarded-Proto` (the app already trusts `X-Forwarded-*`).

If your proxy does not set that header, set `SECURE_COOKIES=true` and make sure
the app is never reachable over plain HTTP — otherwise sign-in fails silently,
because the browser is issued a cookie it will not send back.
`SECURE_COOKIES=false` disables the flag entirely and is only appropriate for
local development.

## Backups

Everything is in the volume: `app.db` (plus its `-wal` and `-shm` companions)
and the `session-secret` file. The simplest safe backup is to stop the
container and copy the directory:

```bash
docker compose stop web
docker run --rm -v curriculum-mapping-tool_cmt-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/cmt-backup.tar.gz -C /data .
docker compose start web
```

The volume name is prefixed with the directory Compose runs in — check
`docker volume ls` if you cloned to a different folder name. To keep the data
somewhere you can back up directly, swap the named volume in `compose.yaml` for
a host path such as `./data:/data` — that directory must be writable by uid 1000.

## Deployment notes for Trust IT

- Runs as a single container on any Docker host, or directly on Node ≥ 22.5 on
  an internal Windows or Linux server. No external database, and no internet
  access needed at runtime.
- Without Docker: run `npm run setup && npm run build` once, then keep
  `npm start` running as a service (NSSM on Windows, systemd on Linux).
- Set `SESSION_SECRET` explicitly if you want managed secret rotation;
  otherwise one is generated and stored in `DATA_DIR`.
- Back up `DATA_DIR` (SQLite database + session secret).

## Deploying to Railway

The repo ships with a `Dockerfile` and `railway.json`, so Railway builds and
runs the app with no extra configuration. Two things are essential:

1. **A persistent volume** — Railway's container filesystem is wiped on every
   redeploy. Without a volume your SQLite database (all users, opportunities,
   logs) and session secret are lost each deploy.
2. **An EU region + demo data only** — see the information-governance note
   below before putting any real personal data on a public cloud.

### Steps

1. In Railway: **New Project → Deploy from GitHub repo**, and pick this repo.
   Railway detects the `Dockerfile` and builds it automatically.
2. **Add a volume:** open the service → **Variables/Settings → Volumes →
   New Volume**, mount path **`/data`**. The Dockerfile already sets
   `DATA_DIR=/data`, so the database and session secret persist there.
3. **Set environment variables** on the service:
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` — the first admin account. (Leave the
     password out and it is generated and printed to the deploy logs.)
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`).
   - `NODE_ENV` is already `production` from the Dockerfile, and Railway
     injects `PORT`, which the server honours.
4. **Generate a domain:** service → **Settings → Networking → Generate Domain**.

Alternatively, with the Railway CLI: `railway init`, then `railway up`, then
add the volume and variables in the dashboard as above.

### Turning on email notifications (optional)

The app works without email — notifications are simply logged. To send real
emails (educators on QA decisions, admins on new registrations, users on
password resets), connect any SMTP service (e.g. NHSmail relay, or a provider
such as Resend/SendGrid/Mailgun) by setting the `SMTP_*`, `MAIL_FROM` and
`APP_URL` variables from the configuration table above. No code change is
needed — set the variables and restart the app.

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

## Licence

The upstream repository carries no licence file, so all rights remain with the
original author, [apassey-droid](https://github.com/apassey-droid). This fork
exists to package their work as a container; ask them before reusing the code
beyond what GitHub's terms of service permit for forks.
