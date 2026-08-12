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
- **Officer** — an **overview** of the work that is waiting (requests needing a decision,
  corrections to review, opportunity applications, oldest-first), register beneficiaries
  (consent-gated, with a live duplicate check as they type), maintain the official record
  and its impairment list, create/edit/decide/distribute/complete support requests with a
  recorded reason, resolve corrections, publish opportunities, **review applicants** and
  **apply on behalf of a beneficiary who cannot use the form**. The sidebar badges the
  queues that have work waiting, so nothing ages behind an unopened tab.
- **Beneficiary** — read their own verified record, **request support themselves** and
  withdraw it, track status, **apply to published opportunities** and withdraw an
  application, manage messages (with an unread indicator in the header on every
  screen), request a correction (officer-mediated) and see the outcome — with the
  recorded reason — of every request and application they have made.
- **Provider** — search the registry by *recorded need* only (no name / ID / history),
  submit and withdraw targeted offers, track them, publish opportunities and decide on
  applications **to their own postings only** — a provider must not acquire a roster of
  beneficiaries through the back door.
- **Admin** — coverage & distribution reports (Table 3.3 measures, exportable to CSV or
  print), read-only registry oversight, users & roles, **provider organisations**,
  national announcements, and a searchable, paged audit log.

Every role also has a **My account** page for changing their password and their
interface language (stored on the account, not just in the browser), and anyone who
loses their password can recover it themselves from the sign-in screen — a single-use
code is emailed and is valid for one hour.

## Opportunities are something you can act on
Publishing scholarships, jobs and training to every registered beneficiary fixes the
*distribution* failure — the information travels. It does not, on its own, fix the
exclusion: a person who reads "apply by 30 August" and has no way to say **me** is no
better served than before. So an opportunity carries a **closing date**, a **number of
places**, and an **Apply** action, and it works the same way a support request does:

- **Two origins.** A beneficiary applies for themselves, **or an officer applies on
  their behalf**. A self-service-only process quietly selects for literacy, for owning a
  device and for having an email address — the three things a rural disability registry
  cannot assume. The application records which it was, and the beneficiary is notified
  either way: being helped must never mean being kept in the dark.
- **Every decision carries a recorded reason** — accepted, shortlisted or not selected —
  shown to the applicant in the app and by email. A rejection nobody has to justify is
  indistinguishable, to the person refused, from an arbitrary one.
- **Withdrawal and re-application** are allowed while a decision is outstanding, because
  changing your mind is not a mistake.
- **Uptake is measured.** The report shows how many beneficiaries have ever applied to
  anything, and what share of applications an officer had to submit for somebody. A high
  mediated share is not a failure — it is the size of the population a self-service-only
  system would have silently excluded.

An *announcement* is information to read, so it has nothing to apply to and says so.

## Reports — Excel and PDF, for every role
The numbers here end up in a monthly return, a council paper or a case file,
and none of those live inside the app. Every role has a **Reports & exports**
page offering the reports it is entitled to, in two formats generated on the
server from a single description — so the two can never drift apart:

- **Excel (.xlsx)** — a *Summary* sheet first, then one sheet per dataset, with
  a branded title block, a frozen header row, auto-filter, sensible column
  widths, wrapped prose, banded rows and a print footer.
- **PDF** — the IDS mark drawn as vectors, a cover block, at-a-glance panels,
  tables with repeating headers, landscape for wide datasets, and *Page n of m*.

| Role | Reports |
|---|---|
| **Beneficiary** | Their own record and support history — a printable statement of everything held about them, with every decision and its recorded reason |
| **Officer** | Registry · support requests and decisions · correction requests · opportunities and applications |
| **Provider** | Their own offers · recorded needs matching their search (**by code only** — no names) |
| **Admin** | District coverage report · registry oversight (**no national IDs**) · users and organisations · opportunities · audit log |

Scoping is the security story: the catalogue is filtered by role, and each
report re-derives its scope from the signed-in user rather than trusting a
query parameter. The oversight export withholds national IDs exactly as the
oversight screen does — an export must not become the side door round a
restriction. Every file carries the Law No. 058/2021 confidentiality notice.

Downloads are fetched with the `Authorization` header rather than a token in
the URL, and arrive base64-wrapped in JSON: Edge's PDF handler claims any
response body beginning `%PDF`, even one being read by `fetch()`, which made
PDF reports save as 0-byte files. Scripts can still take the raw stream from
`GET /api/reports/:key/pdf`.

## Scale & reporting
The registry is measured against a district population of ~2,400, so the registry,
oversight and audit lists **page in the database** rather than rendering every row: the
page comes back in the body and the full match count in an `X-Total-Count` header, so a
search says how many people it actually found, not how many fitted on the screen.
Search boxes are debounced. The registry, oversight registry, audit log and the district
report all **export to CSV** (UTF-8 with a BOM, formula-injection neutralised), because
the alternative to an export is retyping the numbers into the monthly return.

## Tests
With the backend running and the database seeded:

```bash
npm run seed          # reset to known demo data
npm run test:api      # 243 checks — RBAC, CRUD, validation, workflow, metrics,
                      #              pagination, applications, password recovery,
                      #              and every report generating as a real file
npm run test:ui       # 97 checks — drives the real SPA in Microsoft Edge:
                      #             every screen, dialog, a11y and keyboard path
npm run test:nav      # 105 checks — every route for every role, the guards that
                      #              keep each role out of the others, full
                      #              create → table → update → delete round trips,
                      #              and Excel/PDF downloads landing on disk —
                      #              all driven through the browser
npm run test:mail     # triggers all 10 notification paths against the live mailer
npm test              # seed + api + ui + nav (445 checks)
```

Both suites honour `IDS_TEST_URL` (default `http://127.0.0.1:4000`), so they can be
pointed at a staging deploy or at a second local instance when :4000 is busy.

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
