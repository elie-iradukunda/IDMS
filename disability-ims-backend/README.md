# Inclusive Disability Support IMS — Backend

Node.js + Express + **Sequelize** + **MySQL** API for the system described in the proposal
*"Development of an Inclusive Disability Support Information Management System for Rural
Communities"* (Case study: Kamonyi District). It serves the four role dashboards in
`disability-ims.html`.

## Stack
- **Express** + **helmet** + **express-rate-limit** — HTTP, security headers, brute-force protection
- **Sequelize** (v6) + **mysql2** — ORM & MySQL 8
- **JWT** + **bcryptjs** — authentication; **nodemailer** — credentials issued by email
- Business rules live in `src/services/`; routes stay thin.

## Sequelize models (`src/models/index.js`)
| Model | Purpose (proposal reference) |
|---|---|
| `User` | Login account; RBAC role OFFICER / BENEFICIARY / PROVIDER / ADMIN (§2.1.10). |
| `Provider` | NGO, cooperative, employer or donor (§2.1.7). |
| `Beneficiary` | The centralised registry record (§2.1.5), incl. consent for Law 058/2021. |
| `Impairment` | Washington Group type + difficulty level (§2.2.1). |
| `SupportRequest` | Request → decision (with reason) → distribution → completion (§2.2.3). |
| `RequestEvent` | Traceable support history / timeline. |
| `Correction` | Beneficiary's mediated right of correction (§2.1.8). |
| `Opportunity` | Jobs, scholarships, training, announcements (§2.2.4). |
| `Notification` | In-app messages; the email adapter hooks into the same service. |
| `AuditLog` | Append-only log of every change to sensitive data. |
| `Counter` | Atomic `B-1001` / `R-501` codes. |

**Key modelling decision from §3.5.3:** the record stores the *impairment*, the *daily
challenges* and the *support needs* as separate fields — a category alone cannot express what
a person needs. The beneficiary's view is the **same data under a read-only permission**, not
a second copy that could diverge.

## Workflow implemented
```
Officer registers ──▶ validate + duplicate check ──▶ registry
                                   │
                     account created, credentials emailed
                                   ▼
Provider searches by recorded need ──▶ submits offer ──▶ REQUESTED
                                   │
                  Officer decides (reason REQUIRED, shown to beneficiary)
                     ├─ urgent      → APPROVED_URGENT   (priority)
                     ├─ standard    → APPROVED_STANDARD (queued)
                     └─ ineligible  → INELIGIBLE  (+reason, right of correction kept)
                                   ▼
                     DISTRIBUTING ──▶ COMPLETED (support history stored)
```

## How the proposal's requirements are enforced (Table 6)
- **Consent is mandatory** — registration is refused without it (Law No. 058/2021).
- **Duplicate detection** — matches national ID, or name within a sector; returns the
  candidates so the officer decides rather than being silently blocked.
- **Reason required on every decision** — a decision that must be explained is one that must
  be justifiable; the reason is stored and shown to the beneficiary.
- **Least-privilege provider search** — providers get `code`, `sector`, `supportNeeds` and
  impairment only: **no name, no national ID, no daily challenges**.
- **Read-only beneficiary profile** — beneficiaries cannot PATCH their record; they submit a
  correction, which an officer applies or declines, and both are logged.
- **Guardian/officer-mediated access** — a beneficiary with no email still registers
  successfully; the response returns `mediatedAccess: true` rather than failing.
- **Audit logging** — every registration, update, decision and correction is recorded.

## API (all under `/api`)
**Public** — `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`
**Shared** — `GET /me`, `POST /me/password`, `POST /me/language`, `GET /opportunities`
**Officer** — `GET|POST /registry`, `GET /registry/:id`, `PATCH /registry/:id`,
`POST /registry/:id/status`, `DELETE /registry/:id` (soft-archive),
`POST /registry/check-duplicate`, `GET /corrections`, `POST /corrections/:id/resolve`,
`GET /support/requests`, `POST /support/requests/:id/{decide|distribute|complete}`
**Beneficiary** — `GET /my/profile`, `GET /my/support`, `POST /my/corrections`,
`GET /my/notifications`, `POST /my/notifications/:id/read`
**Provider** — `GET /provider/search?impairmentType=&sector=`, `GET /provider/offers`
**Both officer+provider** — `POST /support/requests`, `POST /support/requests/:id/cancel`
**Opportunities (officer/provider/admin, own or admin)** — `POST /opportunities`,
`PATCH /opportunities/:id`, `DELETE /opportunities/:id`
**Admin** — `GET /admin/reports`, `GET /admin/audit`, `GET /admin/providers`,
`GET|POST /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id`

Bodies: decide `{ "decision": "urgent|standard|ineligible", "reason": "..." }`;
register `{ fullName, nationalId, sector, cell, village, guardianName, email,
dailyChallenges, supportNeeds, impairments:[{type,level}], consentGiven:true, allowDuplicate? }`.

## Reports (Table 5 measures, `GET /admin/reports`)
`registered`, `coveragePercent` (against `ESTIMATED_PWD_POPULATION`, default 2,400 per
Table 3), `completenessPercent`, `duplicationPercent`, `verifiedPercent`, `supportDelivered`,
`traceabilityPercent` (decisions carrying a reason), `avgTurnaroundDays`, `byStatus`,
`bySector`, `byImpairment`.

## Run locally
```bash
cp .env.example .env        # set DATABASE_URL + JWT_SECRET
# CREATE DATABASE disability_ims CHARACTER SET utf8mb4;
npm install
npm run seed                # creates tables + demo data (force sync)
npm run dev                 # http://localhost:4000
```
Demo accounts (password `password123`): `officer@kamonyi.gov.rw`, `alice@beneficiary.rw`,
`provider@ngo.rw`, `admin@disability.gov.rw`.

**Email:** leave `SMTP_HOST` empty in development — issued credentials are printed to the
console instead of being sent, so the workflow is demonstrable without a mail server. Set the
SMTP variables for real delivery.

## Deploy
1. Provision MySQL 8; set `DATABASE_URL` and a strong `JWT_SECRET`; configure SMTP.
2. Use **migrations** (sequelize-cli) in production. `DB_SYNC=true` is a dev convenience only,
   and `npm run seed` **drops all tables** — never run it against production data.
3. Start with `npm start`. Serve the frontend over HTTPS and point it at the API base URL,
   sending `Authorization: Bearer <token>`.

## Verified end-to-end
Tested against a live MySQL-compatible server: all four logins; beneficiary blocked from the
registry (403); provider search leaks no identity; registration with credentials issued;
consent refusal blocked; duplicate detected; decision without a reason rejected; full
REQUESTED → APPROVED → DISTRIBUTING → COMPLETED path; illegal repeat transition rejected;
read-only profile enforced (403 on PATCH); correction submitted; reports and audit log correct.

## Scope note
This is the **prototype** described in §1.6.4 — it supports officer and provider decisions and
does not determine legal entitlement. WCAG 2.1 AA conformance is implemented in the frontend
(language toggle RW/EN, text resizing, high-contrast mode, visible focus, keyboard operation,
44px targets); per §3.9.2 automated conformance is necessary but **not sufficient** — testing
with users who have actual visual, hearing, motor and cognitive impairments is still required.
