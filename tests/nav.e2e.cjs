// ─────────────────────────────────────────────────────────────
// Navigation & CRUD sweep.
//
// api.e2e.mjs proves the rules hold at the API. ui.e2e.cjs proves the screens
// render and the dialogs are operable. This suite proves the third thing:
// that a real person can reach every page of their own dashboard, is kept out
// of everybody else's, and can drive a record all the way through
// create → appears in the table → update → delete using nothing but the UI.
//
// A CRUD path that works in Postman and not in the browser is a CRUD path
// that does not work.
// ─────────────────────────────────────────────────────────────
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = (process.env.IDS_TEST_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
// Default into tests/screenshots (gitignored) rather than the working
// directory — see the note in ui.e2e.cjs.
const SHOTS = process.argv[2] || path.join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const STAMP = Date.now().toString().slice(-6);   // keeps re-runs from colliding

let pass = 0, fail = 0;
const log = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; log.push(`  PASS  ${name}`); }
  else { fail++; log.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  return ok;
};
const section = (s) => log.push(`\n=== ${s} ===`);

// Every route the sidebar can reach, per role.
const ROUTES = {
  OFFICER: {
    email: 'officer@kamonyi.gov.rw',
    home: '/officer',
    pages: [
      ['/officer/overview', /awaiting your decision/i],
      ['/officer/registry', /record\(s\)|no matching records/i],
      ['/officer/register', /register a beneficiary/i],
      ['/officer/requests', /request\(s\)|no support requests/i],
      ['/officer/corrections', /correction/i],
      ['/officer/publish', /published opportunities/i],
      ['/officer/reports', /reports & exports/i],
      ['/officer/account', /my account/i],
    ],
    forbidden: ['/admin/users', '/provider/search', '/beneficiary/profile'],
  },
  BENEFICIARY: {
    email: 'alice@beneficiary.rw',
    home: '/beneficiary',
    pages: [
      ['/beneficiary/profile', /read-only/i],
      ['/beneficiary/support', /request support/i],
      ['/beneficiary/opportunities', /opportunity\/ies|no opportunities/i],
      ['/beneficiary/messages', /message|mark all read/i],
      ['/beneficiary/reports', /reports & exports/i],
      ['/beneficiary/account', /my account/i],
    ],
    forbidden: ['/officer/registry', '/admin/reports', '/provider/offers'],
  },
  PROVIDER: {
    email: 'provider@ngo.rw',
    home: '/provider',
    pages: [
      ['/provider/search', /recorded need|no matching beneficiaries/i],
      ['/provider/offers', /offer/i],
      ['/provider/publish', /published opportunities/i],
      ['/provider/reports', /reports & exports/i],
      ['/provider/account', /my account/i],
    ],
    forbidden: ['/officer/registry', '/admin/audit', '/beneficiary/messages'],
  },
  ADMIN: {
    email: 'admin@disability.gov.rw',
    home: '/admin',
    pages: [
      ['/admin/reports', /coverage/i],
      ['/admin/registry', /read-only/i],
      ['/admin/users', /users & role/i],
      ['/admin/providers', /organisation/i],
      ['/admin/announcement', /announcement|opportunit/i],
      ['/admin/audit', /audit log/i],
      ['/admin/exports', /reports & exports/i],
      ['/admin/account', /my account/i],
    ],
    forbidden: ['/officer/registry', '/provider/search', '/beneficiary/profile'],
  },
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon')) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });

  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `nav-${name}.png`), fullPage: false });
  const mainText = () => page.locator('main').innerText();
  const bodyText = () => page.locator('body').innerText();

  const login = async (email) => {
    // Let the app finish booting before clearing storage — clearing it
    // mid-boot pulls the token out from under the in-flight session restore
    // and produces a 401 this harness would then report as a browser error.
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#em');
    await page.fill('#em', email);
    await page.fill('#pw', 'password123');
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(1400);
  };
  const goto = async (p) => {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  };
  const submitModal = async () => {
    await page.locator('.modal-foot button[type="submit"]').last().click();
    await page.waitForTimeout(1300);
  };
  const closeModal = async () => {
    const x = page.locator('.modal-x');
    if (await x.count()) await x.last().click();
    await page.waitForTimeout(400);
  };

  // ═══════════════════════════════════════════════════════════
  // 1 · EVERY PAGE, EVERY ROLE
  // ═══════════════════════════════════════════════════════════
  for (const [role, cfg] of Object.entries(ROUTES)) {
    section(`${role} — NAVIGATION`);
    await login(cfg.email);
    check(`${role} lands inside their own dashboard`, page.url().includes(cfg.home), page.url());

    for (const [route, expect] of cfg.pages) {
      await goto(route);
      const text = await mainText();
      const rendered = expect.test(text);
      // An error state means the page loaded but its data did not.
      const broke = /something went wrong|cannot reach the server/i.test(text);
      check(`${role} · ${route} renders`, rendered && !broke,
        broke ? 'error state shown' : text.slice(0, 70).replace(/\n/g, ' '));
    }
    await shot(`${role.toLowerCase()}-last-page`);

    // Sidebar links must match the routes that exist — a nav entry pointing
    // nowhere is how a page silently disappears from a system.
    const navHrefs = await page.locator('.sidebar a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    const declared = cfg.pages.map(([r]) => r);
    check(`${role} sidebar links all resolve to real pages`,
      navHrefs.length === declared.length && navHrefs.every((h) => declared.includes(h)),
      `nav=${navHrefs.join(',')}`);

    // ── Route guards ──
    for (const route of cfg.forbidden) {
      await goto(route);
      check(`${role} is kept out of ${route}`, !page.url().includes(route), `landed on ${page.url()}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2 · ADMIN CRUD — provider organisation, through the UI
  // ═══════════════════════════════════════════════════════════
  section('CRUD — PROVIDER ORGANISATION (admin, via the UI)');
  await login(ROUTES.ADMIN.email);
  await goto('/admin/providers');
  const orgName = `E2E Org ${STAMP}`;

  await page.locator('button', { hasText: 'Add organisation' }).first().click();
  await page.waitForSelector('#p-name');
  await page.fill('#p-name', orgName);
  await page.selectOption('#p-type', 'NGO');
  await page.fill('#p-contact', 'e2e@example.rw');
  await submitModal();
  check('CREATE · organisation appears in the table', (await mainText()).includes(orgName));

  // UPDATE — the edit button on the row we just created.
  const orgRow = page.locator('tr', { hasText: orgName }).first();
  await orgRow.locator('button').first().click();
  await page.waitForSelector('#p-name');
  await page.fill('#p-contact', 'updated@example.rw');
  await submitModal();
  check('UPDATE · the edited value is in the table',
    (await mainText()).includes('updated@example.rw'));

  // DELETE — guarded: it has no accounts and no history, so it may go.
  await page.locator('tr', { hasText: orgName }).first().locator('button.red').click();
  await page.waitForSelector('[role="dialog"]');
  check('DELETE · a confirmation states the consequence',
    /permanently/i.test(await page.locator('[role="dialog"]').innerText()));
  await page.locator('[role="dialog"] button', { hasText: 'Delete organisation' }).click();
  await page.waitForTimeout(1300);
  check('DELETE · the row is gone from the table', !(await mainText()).includes(orgName));
  await shot('admin-providers-after-crud');

  // An organisation that is in use must refuse deletion rather than orphan data.
  const inUse = page.locator('tr', { hasText: 'Inclusive Hands NGO' }).first();
  check('DELETE is blocked for an organisation with accounts or history',
    await inUse.locator('button.red').isDisabled());

  // ═══════════════════════════════════════════════════════════
  // 3 · ADMIN CRUD — staff account
  // ═══════════════════════════════════════════════════════════
  section('CRUD — STAFF ACCOUNT (admin, via the UI)');
  await goto('/admin/users');
  const staffEmail = `e2e.officer.${STAMP}@kamonyi.gov.rw`;

  await page.locator('button', { hasText: 'Create staff account' }).first().click();
  await page.waitForSelector('#u-name');
  await page.fill('#u-name', `E2E Officer ${STAMP}`);
  await page.fill('#u-email', staffEmail);
  await page.selectOption('#u-role', 'OFFICER');
  await page.selectOption('#u-sector', 'Runda');
  await submitModal();
  check('CREATE · staff account appears in the users table', (await mainText()).includes(staffEmail));
  check('CREATE · the new officer is scoped to their sector',
    (await page.locator('tr', { hasText: staffEmail }).first().innerText()).includes('Runda'));

  // UPDATE — deactivate, and the table must say so.
  const staffRow = () => page.locator('tr', { hasText: staffEmail }).first();
  await staffRow().locator('button').nth(2).click();          // the power/status button
  await page.waitForSelector('[role="dialog"]');
  await page.locator('[role="dialog"] button', { hasText: 'Deactivate' }).click();
  await page.waitForTimeout(1300);
  check('UPDATE · the account reads as deactivated',
    /deactivated/i.test(await staffRow().innerText()));

  // DELETE
  await staffRow().locator('button.red').click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('[role="dialog"] button', { hasText: 'Delete permanently' }).click();
  await page.waitForTimeout(1300);
  check('DELETE · the account is gone from the table', !(await mainText()).includes(staffEmail));
  await shot('admin-users-after-crud');

  // The administrator must not be able to lock themselves out.
  const selfRow = page.locator('tr', { hasText: 'admin@disability.gov.rw' }).first();
  check('An admin cannot deactivate or delete their own account',
    await selfRow.locator('button').nth(2).isDisabled() && await selfRow.locator('button.red').isDisabled());

  // ═══════════════════════════════════════════════════════════
  // 4 · OFFICER CRUD — register a beneficiary, then maintain it
  // ═══════════════════════════════════════════════════════════
  section('CRUD — BENEFICIARY RECORD (officer, via the UI)');
  await login(ROUTES.OFFICER.email);
  await goto('/officer/register');
  const personName = `E2E Uwimana ${STAMP}`;

  await page.fill('#rb-name', personName);
  await page.fill('#rb-nid', `1199${STAMP}0001`);
  await page.selectOption('#rb-sector', 'Runda');
  await page.fill('#rb-cell', 'Kabuga');
  await page.fill('#rb-village', 'E2E Village');
  await page.fill('#rb-daily', 'Cannot travel to the health post alone.');
  await page.fill('#rb-needs', 'A wheelchair and a ramp at the house.');
  await page.selectOption('#rb-imp-0', 'walking');
  await page.selectOption('#rb-lvl-0', 'alot');

  // Consent is mandatory — submitting without it must be refused, in the UI.
  await page.locator('button[type="submit"]', { hasText: 'Register' }).click();
  await page.waitForTimeout(700);
  check('VALIDATION · registration without consent is refused in the form',
    /consent/i.test(await mainText()));

  await page.check('#rb-consent');
  await page.locator('button[type="submit"]', { hasText: 'Register' }).click();
  await page.waitForTimeout(2200);
  const success = await mainText();
  check('CREATE · the beneficiary is registered and given a code', /B-\d{4}/.test(success), success.slice(0, 90));
  check('CREATE · mediated access is stated when there is no email',
    /guardian- and officer-mediated|no email address/i.test(success));
  await shot('officer-register-success');

  // READ — the record must be findable by the registry search.
  await goto('/officer/registry');
  await page.fill('#sq', personName);
  await page.waitForTimeout(1400);
  check('READ · the new record is found by the server-side search',
    (await mainText()).includes(personName));

  // UPDATE — edit the official record.
  await page.locator('button', { hasText: 'Edit record' }).first().click();
  await page.waitForSelector('#e-village');
  await page.fill('#e-village', 'E2E Village Corrected');
  await submitModal();
  check('UPDATE · the edited record shows the new value',
    (await mainText()).includes('E2E Village Corrected'));

  // UPDATE — the impairment list is maintainable, and cannot be emptied.
  await page.locator('button', { hasText: 'Impairments' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(700);
  check('UPDATE · the impairment dialog refuses to remove the last one',
    await page.locator('[role="dialog"] button.red').first().isDisabled());
  await page.selectOption('#ai-type', 'seeing');
  await submitModal();
  await page.waitForTimeout(600);
  check('CREATE · a second impairment is added',
    (await page.locator('[role="dialog"]').innerText()).includes('Seeing'));
  await closeModal();

  // CREATE — an officer-initiated support request for this person.
  await page.locator('button', { hasText: 'Request support' }).first().click();
  await page.waitForSelector('#cr-need');
  await page.fill('#cr-need', 'Wheelchair, urgent — E2E');
  await submitModal();
  check('CREATE · an officer can raise a support request on their behalf',
    !(await page.locator('[role="dialog"]').count()));

  // DELETE (archive) — the lifecycle path that preserves history.
  await page.fill('#sq', personName);
  await page.waitForTimeout(1400);
  await page.locator('button', { hasText: 'Archive' }).first().click();
  await page.waitForSelector('#st-sel');
  await page.selectOption('#st-sel', 'ARCHIVED');
  await submitModal();
  await page.fill('#sq', personName);
  await page.waitForTimeout(1400);
  check('ARCHIVE · the record leaves active coordination without being destroyed',
    /archived/i.test(await mainText()));
  await shot('officer-registry-after-crud');

  // ═══════════════════════════════════════════════════════════
  // 5 · OFFICER — decide a support request, with its reason
  // ═══════════════════════════════════════════════════════════
  section('WORKFLOW — SUPPORT REQUEST DECISION (officer, via the UI)');
  await goto('/officer/requests');
  await page.selectOption('.toolbar select', 'REQUESTED');
  await page.waitForTimeout(1200);
  const hasPending = /request\(s\)/.test(await mainText());
  if (hasPending) {
    await page.locator('button', { hasText: 'Approve · Standard' }).first().click();
    await page.waitForSelector('#d-reason');
    await submitModal();
    check('VALIDATION · a decision without a reason is refused',
      /reason is required/i.test(await page.locator('[role="dialog"]').innerText()));
    await page.fill('#d-reason', 'Verified need; queued for the next distribution round.');
    await submitModal();
    check('WORKFLOW · the decision is recorded and the request leaves the queue',
      !(await page.locator('[role="dialog"]').count()));
    await shot('officer-requests-after-decision');
  } else {
    check('There is a pending request to decide', false, 'none in REQUESTED state');
  }

  // ═══════════════════════════════════════════════════════════
  // 6 · OFFICER CRUD — opportunity, then a beneficiary applies
  // ═══════════════════════════════════════════════════════════
  section('CRUD — OPPORTUNITY + APPLICATION (end to end, via the UI)');
  await goto('/officer/publish');
  const oppTitle = `E2E Training ${STAMP}`;
  const future = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  await page.locator('button', { hasText: 'Publish an opportunity' }).first().click();
  await page.waitForSelector('#o-title');
  await page.selectOption('#o-kind', 'training');
  await page.fill('#o-title', oppTitle);
  await page.fill('#o-org', 'E2E Institute');
  await page.fill('#o-deadline', future);
  await page.fill('#o-slots', '5');
  await page.fill('#o-detail', 'A digital-skills course for this end-to-end test.');
  await submitModal();
  check('CREATE · the opportunity is published and listed', (await mainText()).includes(oppTitle));
  const oppRow = () => page.locator('.opp-row').filter({ hasText: oppTitle }).first();
  const rowText = await oppRow().innerText();
  check('CREATE · it opens for applications with a closing date and places',
    rowText.includes(future) && /place\(s\)/i.test(rowText) && /application\(s\)/i.test(rowText),
    rowText.replace(/\n/g, ' ').slice(0, 110));
  await shot('officer-publish-after-create');

  // A beneficiary can now act on it — the whole point of publishing.
  await login(ROUTES.BENEFICIARY.email);
  await goto('/beneficiary/opportunities');
  await page.fill('#opp-q', oppTitle);
  await page.waitForTimeout(700);
  check('READ · the beneficiary sees the new opportunity', (await mainText()).includes(oppTitle));

  await page.locator('button', { hasText: 'Apply' }).first().click();
  await page.waitForSelector('#ap-note');
  await page.fill('#ap-note', 'I would like a place on this course.');
  await submitModal();
  check('CREATE · the beneficiary applies and sees their own status',
    /awaiting a decision/i.test(await mainText()));

  // WITHDRAW — changing your mind is not a mistake.
  await page.locator('button', { hasText: 'Withdraw my application' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('[role="dialog"] button', { hasText: 'Withdraw' }).last().click();
  await page.waitForTimeout(1300);
  await page.fill('#opp-q', oppTitle);
  await page.waitForTimeout(600);
  check('DELETE · the application is withdrawn and applying is offered again',
    (await page.locator('button', { hasText: 'Apply' }).count()) > 0);
  await shot('beneficiary-opportunity-after-apply');

  // Re-apply, so the officer has something to decide on.
  await page.locator('button', { hasText: 'Apply' }).first().click();
  await page.waitForSelector('#ap-note');
  await submitModal();

  // The officer reviews it and records a decision with a reason.
  await login(ROUTES.OFFICER.email);
  await goto('/officer/publish');
  await page.locator('.opp-row').filter({ hasText: oppTitle }).first()
    .locator('button', { hasText: 'Applicants' }).first().click();
  await page.waitForSelector('[role="dialog"] .code', { timeout: 10000 });
  check('READ · the officer sees who applied',
    /B-1\d{3}/.test(await page.locator('[role="dialog"]').innerText()));
  await page.locator('[role="dialog"] button', { hasText: 'Accept' }).first().click();
  await page.waitForSelector('#ad-reason');
  await page.fill('#ad-reason', 'Awarded one of the five places on the course.');
  await submitModal();
  check('UPDATE · the application decision is recorded',
    !(await page.locator('#ad-reason').count()));
  await shot('officer-applicants-after-decision');
  await closeModal();

  // DELETE — remove the opportunity we created.
  await goto('/officer/publish');
  await page.locator('.opp-row').filter({ hasText: oppTitle }).first()
    .locator('button.red').first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('[role="dialog"] button', { hasText: 'Delete' }).last().click();
  await page.waitForTimeout(1300);
  check('DELETE · the opportunity is removed', !(await mainText()).includes(oppTitle));

  // ═══════════════════════════════════════════════════════════
  // 7 · TABLES — every tabular view has real headers and rows
  // ═══════════════════════════════════════════════════════════
  section('TABLES');
  await login(ROUTES.ADMIN.email);
  for (const [route, minRows] of [['/admin/users', 5], ['/admin/providers', 2], ['/admin/registry', 5]]) {
    await goto(route);
    const headers = await page.locator('table thead th').count();
    const rows = await page.locator('table tbody tr').count();
    const caption = await page.locator('table caption').count();
    check(`${route} renders a table with headers, rows and a caption`,
      headers >= 4 && rows >= minRows && caption === 1, `th=${headers} tr=${rows} caption=${caption}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 8b · REPORTS — real Excel and PDF files, from the browser
  // A report that generates on the server but never reaches the user's disk
  // is a report nobody has. This drives the actual buttons and checks that a
  // file lands, with the right extension and a plausible size.
  // ═══════════════════════════════════════════════════════════
  section('REPORTS — EXCEL & PDF');
  for (const [role, path, expectMin] of [
    ['ADMIN', '/admin/exports', 2],
    ['OFFICER', '/officer/reports', 3],
    ['BENEFICIARY', '/beneficiary/reports', 1],
    ['PROVIDER', '/provider/reports', 2],
  ]) {
    await login(ROUTES[role].email);
    await goto(path);
    const cards = await page.locator('button', { hasText: 'Excel (.xlsx)' }).count();
    check(`${role} is offered ${expectMin}+ downloadable reports`, cards >= expectMin, `${cards} shown`);

    for (const [label, ext] of [['Excel (.xlsx)', 'xlsx'], ['PDF', 'pdf']]) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
        page.locator('button', { hasText: label }).first().click(),
      ]);
      const name = download?.suggestedFilename() || '';
      let bytes = 0;
      if (download) {
        const p = await download.path();
        if (p) bytes = require('fs').statSync(p).size;
      }
      check(`${role} downloads a ${ext.toUpperCase()} report`,
        !!download && name.endsWith(`.${ext}`) && name.startsWith('IDS-') && bytes > 2000,
        `${name || 'no download'} (${bytes} bytes)`);
      await page.waitForTimeout(600);
    }

    // Preview before committing to a download.
    await page.locator('button', { hasText: 'Preview' }).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
    const dlgText = await page.locator('[role="dialog"]').innerText();
    check(`${role} can preview a report before downloading it`, /row\(s\)/i.test(dlgText));
    check(`${role} preview states the confidentiality obligation`, /058\/2021/.test(dlgText));
    await shot(`reports-${role.toLowerCase()}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // A beneficiary's report is about them, and offers nothing else. Read the
  // report cards specifically — the surrounding layout copy mentions the
  // registry, so scanning the whole page would test the wrong text.
  await login(ROUTES.BENEFICIARY.email);
  await goto('/beneficiary/reports');
  const benCards = await page.locator('.card').allInnerTexts();
  const offered = benCards.join('\n');
  check('The beneficiary report is their own record and history',
    /my record and support history/i.test(offered));
  check('The beneficiary is offered exactly one report — their own',
    (await page.locator('button', { hasText: 'Excel (.xlsx)' }).count()) === 1);
  check('The beneficiary is offered no registry-wide or audit export',
    !/beneficiary registry|audit log|district coverage/i.test(offered),
    offered.slice(0, 120).replace(/\n/g, ' '));

  // ═══════════════════════════════════════════════════════════
  // 8 · CSV EXPORT — the district return has to leave the app
  // ═══════════════════════════════════════════════════════════
  section('EXPORTS');
  await login(ROUTES.ADMIN.email);   // the reports sweep above ended as a beneficiary
  for (const [route, label] of [['/admin/registry', 'Export page (CSV)'], ['/admin/audit', 'Export this page (CSV)'], ['/admin/reports', 'Export report (CSV)']]) {
    await goto(route);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      page.locator('button', { hasText: label }).first().click(),
    ]);
    check(`${route} exports a CSV file`, !!download && /\.csv$/.test(download.suggestedFilename() || ''),
      download ? download.suggestedFilename() : 'no download event');
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
  console.log(log.join('\n'));
  console.log(`\n${'─'.repeat(60)}`);
  if (errors.length) {
    console.log(`\nBROWSER ERRORS (${errors.length}):`);
    [...new Set(errors)].slice(0, 20).forEach((e) => console.log(`  ${e}`));
  } else {
    console.log('\nNo console errors, page errors or failed requests.');
  }
  console.log(`\nTOTAL: ${pass + fail} checks · ${pass} passed · ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(log.join('\n'));
  console.error(`\nHARNESS ERROR: ${e.message}`);
  process.exit(1);
});
