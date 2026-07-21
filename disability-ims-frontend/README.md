# Inclusive Disability Support IMS — Frontend

**React + Vite + Tailwind CSS v3** client for the system in the proposal
*"Development of an Inclusive Disability Support Information Management System
for Rural Communities"* (Kamonyi District). It talks to the Node + Express +
**Sequelize** + **MySQL** API in [`../disability-ims-backend`](../disability-ims-backend).

This replaces the original single-file `disability-ims.html` prototype: every
screen is now its own React **page** under `src/pages/`, routed with
`react-router-dom`, with real authentication against the backend.

## Design
The UI adopts the **"System Administrator" (green) dashboard design** from the
Fuel Loyalty system: Inter font, a green-gradient left **sidebar** for navigation,
a white top header, slate content surfaces, soft "panel" shadows, KPI stat cards
with gradient icon tiles, and `lucide-react` line icons. The green is a single
theme across all four roles. Brand colours are exposed as CSS variables so
**high-contrast mode** still switches every colour at once.

## Stack
- **React 18** + **Vite 5** — fast dev server and build
- **Tailwind CSS v3** (+ `clsx`, `lucide-react`) — utility styling & icons
- **react-router-dom v6** — one route per sidebar item (deep-linkable)
- JWT auth stored in `localStorage`; the token is attached to every request

## Project structure
```
src/
  main.jsx                app bootstrap (providers + router)
  App.jsx                 route table (login + 4 role dashboards)
  index.css               design tokens, high-contrast theme, component classes
  lib/
    api.js                fetch wrapper (JWT, error/duplicate handling)
    useFetch.js           tiny data-fetching hook
    i18n.js               EN/RW bilingual labels (proposal Table 6)
    constants.js          roles, sectors, status→badge maps
    navigation.js         sidebar nav items per role (lucide icons)
    format.js             relative time, name helpers
  context/
    AuthContext.jsx       login / logout / session refresh
    UIContext.jsx         language, text-zoom, high-contrast, toast
  components/             DashboardLayout (green sidebar + header), A11yBar,
                          Toast, ui primitives (Panel/StatCard/Table…), PublishForm
  pages/
    LoginPage.jsx
    officer/              Registry · Register · Requests · Corrections · Publish
    beneficiary/          Profile · Support · Opportunities · Messages
    provider/             Search · Offers · Publish
    admin/                Reports · Users · Announcement · Audit
```

## Run locally
The backend must be running first (see its README — it needs MySQL 8 and a
`npm run seed`). Then:

```bash
npm install
npm run dev            # http://localhost:5173
```

`vite.config.js` proxies `/api` → `http://localhost:4000`, so the browser uses a
single origin and there is no CORS friction in development.

**Demo accounts** (after `npm run seed` in the backend, password `password123`):
`officer@kamonyi.gov.rw` · `alice@beneficiary.rw` · `provider@ngo.rw` ·
`admin@disability.gov.rw` — or just tap a card on the login screen.

## Build for production
```bash
npm run build         # outputs to dist/
npm run preview       # serve the build locally
```
Set `VITE_API_URL` (see `.env.example`) to the deployed API origin, e.g.
`https://api.disability-ims.rw/api`, and serve `dist/` over HTTPS.

## Accessibility (WCAG 2.1 AA, proposal §3.9)
Carried over from the prototype and kept in every page:
- **Language toggle** RW / EN (Table 6 bilingual labels)
- **Text resizing** (A− / A / A+) and **high-contrast** mode
- Visible keyboard focus, 44px touch targets, semantic roles/labels

Per §3.9.2, automated conformance is necessary but **not sufficient** — testing
with users who have actual visual, hearing, motor and cognitive impairments is
still required.
