// Drives the real built SPA in Edge: every role, every page, every modal.
// Fails on any console error, page error or failed request.
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://127.0.0.1:4000';
const SHOTS = process.argv[2] || '.';
let pass = 0, fail = 0;
const log = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; log.push(`  PASS  ${name}`); }
  else { fail++; log.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  return ok;
};
const section = (s) => log.push(`\n=== ${s} ===`);

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

  const shot = async (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

  const login = async (email, password = 'password123') => {
    // Sign out first: the login route redirects an already-authenticated
    // user straight to their own dashboard.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#em');
    await page.fill('#em', email);
    await page.fill('#pw', password);
    await page.click('form button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  };

  const goto = async (p) => {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
  };

  const visibleText = () => page.locator('main').innerText();

  // ═══ LOGIN ═══
  section('LOGIN');
  await goto('/login');
  check('Login page renders', (await page.locator('#em').count()) === 1);
  await shot('01-login');

  // ═══ OFFICER ═══
  section('OFFICER DASHBOARD');
  await login('officer@kamonyi.gov.rw');
  check('Officer lands on the registry', page.url().includes('/officer'));

  await goto('/officer/registry');
  let txt = await visibleText();
  check('Registry lists seeded beneficiaries', txt.includes('Mukamana Alice') && txt.includes('B-1001'));
  check('Registry shows record count', /record\(s\)/.test(txt), txt.slice(0, 80));
  check('Registry shows impairment chips', txt.includes('Seeing') || txt.includes('Walking'));
  await shot('02-officer-registry');

  // Edit-record modal
  await page.locator('button', { hasText: 'Edit record' }).first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  check('Edit-record modal opens', await page.locator('[role="dialog"]').isVisible());
  check('Modal is labelled for assistive tech', !!(await page.locator('[role="dialog"]').getAttribute('aria-labelledby')));
  check('Modal marks itself modal', (await page.locator('[role="dialog"]').getAttribute('aria-modal')) === 'true');
  check('Edit form is prefilled', !!(await page.locator('#e-name').inputValue()));
  await shot('03-officer-edit-modal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes the modal', (await page.locator('[role="dialog"]').count()) === 0);

  // Impairments modal
  await page.locator('button', { hasText: 'Impairments' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  const impTxt = await page.locator('[role="dialog"]').innerText();
  check('Impairments modal lists current impairments', /difficulty/i.test(impTxt), impTxt.slice(0, 100));
  check('Impairments modal offers an add control', (await page.locator('#ai-type').count()) === 1);
  await shot('04-officer-impairments-modal');
  await page.locator('.modal-x').click();
  await page.waitForTimeout(300);

  // Request-support modal
  await page.locator('button', { hasText: 'Request support' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  check('Officer request-support modal opens with the need prefilled',
    (await page.locator('#cr-need').inputValue()).length > 0);
  await shot('05-officer-request-modal');
  await page.locator('.modal-x').click();
  await page.waitForTimeout(300);

  // Search
  await page.fill('#sq', 'Josiane');
  await page.waitForTimeout(900);
  txt = await visibleText();
  check('Registry server-side search filters', txt.includes('Josiane') && !txt.includes('Mukamana Alice'));
  await page.fill('#sq', '');
  await page.waitForTimeout(700);

  // Support requests
  await goto('/officer/requests');
  txt = await visibleText();
  check('Support requests list renders', txt.includes('R-50'));
  check('Request origins are shown', /Provider offer|Officer-initiated|Requested by the beneficiary/.test(txt));
  check('Timeline events render', txt.includes('Approved') || txt.includes('Requested'));
  await shot('06-officer-requests');

  const decideBtn = page.locator('button', { hasText: 'Approve · Urgent' }).first();
  if (await decideBtn.count()) {
    await decideBtn.click();
    await page.waitForSelector('[role="dialog"]');
    check('Decision modal opens', await page.locator('#d-reason').isVisible());
    await shot('07-officer-decide-modal');
    // Submitting with no reason must be refused, in the dialog
    await page.locator('[role="dialog"] button[type="submit"]').click();
    await page.waitForTimeout(400);
    check('Decision without a reason is blocked in the dialog',
      (await page.locator('[role="dialog"] .err').count()) === 1);
    await page.locator('.modal-x').click();
    await page.waitForTimeout(300);
  } else check('Decision modal opens', false, 'no pending request found');

  // Corrections
  await goto('/officer/corrections');
  await page.waitForSelector('button:has-text("Apply to record")', { timeout: 10000 });
  txt = await visibleText();
  check('Corrections page lists pending requests', /requested correction/i.test(txt), txt.slice(0, 120));
  await shot('08-officer-corrections');
  const applyBtn = page.locator('button', { hasText: 'Apply to record' }).first();
  if (await applyBtn.count()) {
    await applyBtn.click();
    await page.waitForSelector('[role="dialog"]');
    check('Correction apply modal offers field + value', (await page.locator('#cf-field').count()) === 1);
    await shot('09-officer-correction-modal');
    await page.locator('.modal-x').click();
    await page.waitForTimeout(300);
  } else check('Correction apply modal offers field + value', false, 'no pending correction');

  // Register page
  await goto('/officer/register');
  txt = await visibleText();
  check('Register-beneficiary form renders', /consent/i.test(txt));
  await shot('10-officer-register');

  // Publish
  await goto('/officer/publish');
  txt = await visibleText();
  check('Published opportunities list renders', txt.includes('Bursary') || txt.includes('opportunit'));
  await page.locator('button', { hasText: 'Publish an opportunity' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  check('Publish modal opens', (await page.locator('#o-title').count()) === 1);
  await shot('11-officer-publish-modal');
  await page.locator('.modal-x').click();

  // Account
  await goto('/officer/account');
  txt = await visibleText();
  check('Account page shows identity and role', txt.includes('officer@kamonyi.gov.rw'));
  await page.locator('button', { hasText: 'Change password' }).click();
  await page.waitForSelector('[role="dialog"]');
  check('Change-password modal opens', (await page.locator('#pw-cur').count()) === 1);
  await shot('12-officer-account');
  await page.locator('.modal-x').click();

  // ═══ BENEFICIARY ═══
  section('BENEFICIARY DASHBOARD');
  await login('alice@beneficiary.rw');
  await goto('/beneficiary/profile');
  txt = await visibleText();
  check('Profile shows the read-only record', txt.includes('B-1001') && /Read-only/i.test(txt));
  check('Correction history is shown', /correction requests/i.test(txt), txt.slice(0, 120));
  await shot('13-beneficiary-profile');

  await page.locator('button', { hasText: 'Request a correction' }).click();
  await page.waitForSelector('[role="dialog"]');
  check('Correction request modal opens', (await page.locator('#corr-text').count()) === 1);
  await shot('14-beneficiary-correction-modal');
  await page.locator('.modal-x').click();

  await goto('/beneficiary/support');
  txt = await visibleText();
  check('Support history renders with statuses', txt.includes('R-50'));
  check('Beneficiary has a Request-support action', (await page.locator('button', { hasText: 'Request support' }).count()) > 0);
  await page.locator('button', { hasText: 'Request support' }).first().click();
  await page.waitForSelector('[role="dialog"]');
  check('Beneficiary request-support modal opens', (await page.locator('#ask-need').count()) === 1);
  await shot('15-beneficiary-request-modal');
  await page.locator('.modal-x').click();

  await goto('/beneficiary/messages');
  txt = await visibleText();
  check('Messages render', txt.length > 40);
  check('Mark-all-read control present', (await page.locator('button', { hasText: 'Mark all read' }).count()) === 1);
  await shot('16-beneficiary-messages');

  await goto('/beneficiary/opportunities');
  txt = await visibleText();
  check('Opportunities render for the beneficiary', txt.includes('Bursary') || txt.includes('assessment'));
  await shot('17-beneficiary-opportunities');

  // ═══ PROVIDER ═══
  section('PROVIDER DASHBOARD');
  await login('provider@ngo.rw');
  await goto('/provider/search');
  txt = await visibleText();
  check('Provider search renders anonymised results', txt.includes('B-100'));
  check('Provider search hides beneficiary names', !txt.includes('Mukamana') && !txt.includes('Habimana'));
  check('Least-privilege notice is shown', /withheld/i.test(txt));
  await shot('18-provider-search');

  const offerBtn = page.locator('button', { hasText: 'Submit support offer' }).first();
  if (await offerBtn.count()) {
    await offerBtn.click();
    await page.waitForSelector('[role="dialog"]');
    check('Provider offer modal opens prefilled', (await page.locator('#of-need').inputValue()).length > 0);
    await shot('19-provider-offer-modal');
    await page.locator('.modal-x').click();
  } else check('Provider offer modal opens prefilled', false, 'no offerable record');

  await goto('/provider/offers');
  txt = await visibleText();
  check('Provider offers list renders', txt.includes('R-5') || /No offers/i.test(txt));
  await shot('20-provider-offers');

  // ═══ ADMIN ═══
  section('ADMIN DASHBOARD');
  await login('admin@disability.gov.rw');
  await goto('/admin/reports');
  txt = await visibleText();
  check('Reports render the Table 3.3 measures',
    /Coverage/i.test(txt) && /Duplication/i.test(txt) && /completeness/i.test(txt));
  check('Impairment breakdown renders', /Seeing/i.test(txt));
  await shot('21-admin-reports');

  await goto('/admin/registry');
  txt = await visibleText();
  check('Admin registry oversight renders', txt.includes('B-1001'));
  check('Oversight states it is read-only', /Read-only/i.test(txt));
  check('Access column distinguishes mediated access', /mediated/i.test(txt));
  await shot('22-admin-registry');

  await goto('/admin/users');
  txt = await visibleText();
  check('Users table renders', txt.includes('officer@kamonyi.gov.rw'));
  await page.locator('button', { hasText: 'Create staff account' }).click();
  await page.waitForSelector('[role="dialog"]');
  check('Create-user modal opens', (await page.locator('#u-name').count()) === 1);
  await page.selectOption('#u-role', 'PROVIDER');
  await page.waitForTimeout(250);
  check('Choosing PROVIDER reveals the organisation field', (await page.locator('#u-prov').count()) === 1);
  await page.selectOption('#u-role', 'OFFICER');
  await page.waitForTimeout(250);
  check('Choosing OFFICER reveals the sector field', (await page.locator('#u-sector').count()) === 1);
  await shot('23-admin-create-user-modal');
  await page.locator('.modal-x').click();

  await goto('/admin/providers');
  txt = await visibleText();
  check('Provider organisations render with counts', txt.includes('Inclusive Hands NGO'));
  await page.locator('button', { hasText: 'Add organisation' }).click();
  await page.waitForSelector('[role="dialog"]');
  check('Add-organisation modal opens', (await page.locator('#p-name').count()) === 1);
  await shot('24-admin-providers-modal');
  await page.locator('.modal-x').click();

  await goto('/admin/audit');
  txt = await visibleText();
  check('Audit log renders attributed entries', txt.includes('Officer Uwimana'));
  await shot('25-admin-audit');

  await goto('/admin/announcement');
  txt = await visibleText();
  check('National announcement page renders', /announcement/i.test(txt));
  await shot('26-admin-announcement');

  // ═══ ACCESSIBILITY / LOCALISATION ═══
  section('ACCESSIBILITY & LOCALISATION');
  await goto('/admin/reports');
  await page.locator('.a11y button', { hasText: 'RW' }).click();
  await page.waitForTimeout(500);
  txt = await visibleText();
  check('Kinyarwanda toggle changes the interface', /Raporo|Abakoresha|Umuyobozi/.test(await page.locator('.sidebar').innerText()));
  check('html lang attribute follows the toggle', (await page.getAttribute('html', 'lang')) === 'rw');
  await shot('27-kinyarwanda');
  await page.locator('.a11y button', { hasText: 'EN' }).click();
  await page.waitForTimeout(400);

  await page.locator('.a11y button[aria-label="High contrast"]').click();
  await page.waitForTimeout(500);
  check('High-contrast mode applies', (await page.getAttribute('body', 'class'))?.includes('hc'));
  await shot('28-high-contrast');
  await page.locator('.a11y button[aria-label="High contrast"]').click();
  await page.waitForTimeout(300);

  await page.locator('.a11y button[aria-label="Increase text size"]').click();
  await page.locator('.a11y button[aria-label="Increase text size"]').click();
  await page.waitForTimeout(400);
  check('Text resizing applies', (await page.locator('.app-main').getAttribute('style'))?.includes('zoom'));
  await shot('29-text-enlarged');
  await page.locator('.a11y button[aria-label="Reset text size"]').click();

  // Keyboard operation of a dialog
  section('KEYBOARD OPERATION');
  await goto('/admin/providers');
  await page.locator('button', { hasText: 'Add organisation' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  const focused = await page.evaluate(() => document.activeElement?.id);
  check('Focus moves into the dialog on open', focused === 'p-name', `focus was on "${focused}"`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check('Focus returns to the trigger on close', /Add organisation/.test(back || ''), `focus returned to "${back}"`);

  // Mobile viewport
  section('RESPONSIVE');
  await page.setViewportSize({ width: 390, height: 844 });
  await goto('/admin/reports');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('No horizontal overflow at 390px', !overflow);
  await shot('30-mobile-reports');
  await page.setViewportSize({ width: 1440, height: 950 });

  // ═══ RESULTS ═══
  console.log(log.join('\n'));
  console.log(`\n${'─'.repeat(60)}`);
  if (errors.length) {
    console.log(`\nBROWSER ERRORS (${errors.length}):`);
    [...new Set(errors)].slice(0, 25).forEach((e) => console.log(`  ${e}`));
  } else {
    console.log('No console errors, page errors or failed requests.');
  }
  console.log(`\nTOTAL: ${pass + fail} checks · ${pass} passed · ${fail} failed`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(async (e) => {
  console.log(log.join('\n'));
  console.error('\nHARNESS ERROR:', e.message);
  process.exit(1);
});
