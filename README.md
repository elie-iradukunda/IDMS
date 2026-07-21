# Inclusive Disability Support IMS — Kamonyi District

Full-stack implementation of the proposal *"Development of an Inclusive Disability
Support Information Management System for Rural Communities"* (case study: Kamonyi
District). A centralised, accessible registry that coordinates support for persons
with disabilities, with role-based access, a recorded reason for every decision,
duplicate detection, a mediated right of correction, and an audit trail.

## Repository layout
```
IDMS/
├── disability-ims-backend/     Node + Express + Sequelize + MySQL API
├── disability-ims-frontend/    React + Vite + Tailwind CSS v3 client
├── disability-ims.html         original single-file prototype (superseded by the React app)
└── Inclusive_Disability_Support_System_Proposal…docx  the proposal
```

## Architecture
- **Backend** — REST API on `:4000`. Express + **Sequelize v6** + **MySQL 8**,
  JWT auth (bcrypt), helmet, rate-limited login, business rules in `src/services/`.
  Four roles: `OFFICER`, `BENEFICIARY`, `PROVIDER`, `ADMIN`.
- **Frontend** — SPA on `:5173`. **React 18 + Vite 5 + Tailwind CSS v3**,
  `react-router-dom` with one page per dashboard tab, JWT stored client-side,
  bilingual (RW/EN) and WCAG-oriented (text resize, high-contrast, keyboard).
  In dev, Vite proxies `/api` → the backend, so there is no CORS friction.

## Run the whole thing (two terminals)

**1 — Backend** (needs MySQL 8 running):
```bash
cd disability-ims-backend
cp .env.example .env         # set DATABASE_URL + JWT_SECRET
# CREATE DATABASE disability_ims CHARACTER SET utf8mb4;
npm install
npm run seed                 # creates tables + demo data (drops existing!)
npm run dev                  # http://localhost:4000
```

**2 — Frontend:**
```bash
cd disability-ims-frontend
npm install
npm run dev                  # http://localhost:5173
```

Open http://localhost:5173 and sign in. **Demo accounts** (password `password123`,
or just tap a card on the login screen):

| Role | Email |
|---|---|
| Local Officer | `officer@kamonyi.gov.rw` |
| Beneficiary / Guardian | `alice@beneficiary.rw` |
| Support Provider | `provider@ngo.rw` |
| Administrator | `admin@disability.gov.rw` |

Email is optional in dev — issued credentials and reset tokens are printed to the
backend console instead of being sent (see the backend README for SMTP setup).

## What each role can do
- **Officer** — register beneficiaries (consent-gated, duplicate-checked), maintain
  the official record, decide/distribute/complete support requests with a recorded
  reason, resolve corrections, publish opportunities.
- **Beneficiary** — read their own verified record, track support status, browse
  opportunities, read messages, request a correction (officer-mediated).
- **Provider** — search the registry by *recorded need* only (no name / ID / history),
  submit targeted offers, track them, publish opportunities.
- **Admin** — coverage & distribution reports (Table 5 measures), users & roles,
  national announcements, audit log.

## Hosting
The backend can serve the built frontend from the same origin, so the whole
system deploys as **one service** (build the frontend, then run the backend — it
auto-serves `../disability-ims-frontend/dist`). Full instructions, env vars and a
production checklist are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

See each sub-project's README for details:
[backend](disability-ims-backend/README.md) ·
[frontend](disability-ims-frontend/README.md).
