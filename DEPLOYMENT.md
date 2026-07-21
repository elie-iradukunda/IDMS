# Deploying the Inclusive Disability Support IMS

Two supported topologies. **Option A (single service)** is the simplest to host
and is what the code is set up for out of the box.

---

## Prerequisites
- Node.js 18+ and a **MySQL 8** database (local, or managed — Railway, PlanetScale, Aiven, etc.)
- A strong `JWT_SECRET` (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)

---

## Option A — Single service (recommended)
The backend serves the built React app **and** the API from one origin, so there
is no CORS setup and you deploy one thing.

```bash
# 1. Build the frontend
cd disability-ims-frontend
npm ci
npm run build                     # -> disability-ims-frontend/dist

# 2. Configure & start the backend (it auto-serves ../disability-ims-frontend/dist)
cd ../disability-ims-backend
npm ci
cp .env.example .env              # then edit it (see env table below)
npm run seed                      # FIRST run only: creates tables + demo data
npm start                         # serves app + API on :4000
```

Open `http://<host>:4000`. The app calls `/api` on the same origin — nothing else
to configure. To point at a build in another location, set `CLIENT_DIST` to its
absolute path.

### Env vars (backend `.env`)
| Variable | Required | Example / note |
|---|---|---|
| `DATABASE_URL` | ✅ | `mysql://user:pass@host:3306/disability_ims` |
| `JWT_SECRET` | ✅ | long random string |
| `NODE_ENV` | | `production` in prod |
| `PORT` | | defaults to `4000` (most hosts inject this) |
| `CLIENT_DIST` | | absolute path to `dist/`; blank = auto-detect sibling |
| `ESTIMATED_PWD_POPULATION` | | coverage denominator (default `2400`) |
| `SMTP_HOST`/`SMTP_*` | | set for real credential/opportunity emails; blank = log to console |

---

## Option B — Separate frontend + backend
Host the API and the static frontend independently (e.g. API on Render, static
site on Netlify/Vercel).

1. **Backend**: deploy `disability-ims-backend` with the env vars above (no
   `CLIENT_DIST`). CORS is already enabled. Note its public URL.
2. **Frontend**: set `VITE_API_URL` to the API origin **including `/api`**, then build:
   ```bash
   cd disability-ims-frontend
   echo 'VITE_API_URL=https://api.your-host.rw/api' > .env
   npm ci && npm run build          # deploy the dist/ folder to your static host
   ```
   Configure the static host to rewrite unknown routes to `/index.html` (SPA).

---

## Database: seed vs. migrate
- `npm run seed` **drops and recreates all tables** with demo data — great for a
  first deploy or a demo reset, but **never run it against real data**.
- For an ongoing production database, manage schema changes with migrations
  (sequelize-cli) instead of `seed`/`DB_SYNC`.

## Production checklist
- [ ] Serve over **HTTPS** (terminate TLS at the platform/reverse proxy).
- [ ] Strong `JWT_SECRET`; real `DATABASE_URL`; `NODE_ENV=production`.
- [ ] Seeded once (or migrated); demo passwords changed for any real accounts.
- [ ] SMTP configured if credential/opportunity emails should actually send.
- [ ] Database backups enabled (the registry consolidates records that were
      previously only on paper — protect it).

## Demo accounts (after `npm run seed`, password `password123`)
`officer@kamonyi.gov.rw` · `alice@beneficiary.rw` · `provider@ngo.rw` · `admin@disability.gov.rw`
