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

## Email notifications
The system notifies users of decisions, deliveries and new opportunities by email as
well as in-app (Table 3.4). Configure the provider in `disability-ims-backend/.env`:

```ini
MAIL_PROVIDER=gmail                  # or "smtp", or leave empty
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"   # an App Password, not the account password
APP_URL=http://localhost:5173        # where the buttons in the email link to
MAIL_REDIRECT_TO=you@gmail.com       # DEV ONLY — see below
```

Gmail requires 2-Step Verification and an **App Password**
(<https://myaccount.google.com/apppasswords>); a normal password is rejected. With no
provider configured, every message is printed to the backend console instead, and no
workflow is blocked.

`MAIL_REDIRECT_TO` sends all mail to one address regardless of the real recipient
(shown in the subject line). The demo data uses fictional domains such as
`@beneficiary.rw`, and a run of bounces at a non-existent domain is what gets a sending
account throttled. **Clear it in production** so beneficiaries receive their own mail.

Twelve templates are implemented, all bilingual (EN/RW), responsive, and delivered with
a plain-text alternative: account credentials, password reset, new opportunity, request
created, officer decision (with the recorded reason), distribution started, delivery
confirmed, correction applied/declined, correction filed (to the officer), provider
offer filed (to the officer), staff account created, and account deactivated.

## What each role can do
- **Officer** — register beneficiaries (consent-gated, duplicate-checked), maintain the
  official record and its impairment list, create/edit/decide/distribute/complete support
  requests with a recorded reason, resolve corrections, publish opportunities.
- **Beneficiary** — read their own verified record, **request support themselves** and
  withdraw it, track status, browse opportunities, manage messages, request a correction
  (officer-mediated) and see the outcome of every request they have made.
- **Provider** — search the registry by *recorded need* only (no name / ID / history),
  submit and withdraw targeted offers, track them, publish opportunities.
- **Admin** — coverage & distribution reports (Table 3.3 measures), read-only registry
  oversight, users & roles, **provider organisations**, national announcements, audit log.

Every role also has an **My account** page for changing their password and their
interface language (stored on the account, not just in the browser).

## Tests
With the backend running and the database seeded:

```bash
npm run seed          # reset to known demo data
npm run test:api      # 141 checks — RBAC, CRUD, validation, workflow, reports
npm run test:ui       # 60 checks — drives the real SPA in Microsoft Edge
npm run test:mail     # triggers all 10 notification paths against the live mailer
npm test              # seed + api + ui
```

`test:ui` needs a browser driver, deliberately kept out of `package.json` so it is
never installed on the production host: `npm i -D playwright-core` once, and
Microsoft Edge must be present.

`test:ui` also asserts the accessibility behaviour the system depends on: dialogs are
labelled and marked `aria-modal`, focus moves in on open and returns to the trigger on
close, Escape closes, the Kinyarwanda toggle and `html lang` follow each other,
high-contrast and text-resize apply, and there is no horizontal overflow at 390 px.

## Hosting
The backend can serve the built frontend from the same origin, so the whole
system deploys as **one service** (build the frontend, then run the backend — it
auto-serves `../disability-ims-frontend/dist`). Full instructions, env vars and a
production checklist are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

See each sub-project's README for details:
[backend](disability-ims-backend/README.md) ·
[frontend](disability-ims-frontend/README.md).
