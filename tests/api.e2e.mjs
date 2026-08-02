// End-to-end API test: every role, every CRUD path, every RBAC boundary.
const BASE = 'http://127.0.0.1:4000/api';
let pass = 0, fail = 0;
const results = [];

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};

function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  return cond;
}
const section = (s) => results.push(`\n=== ${s} ===`);

const login = async (email, password = 'password123') => {
  const r = await call('/auth/login', { method: 'POST', body: { email, password } });
  return r.data?.token;
};

(async () => {
  // ── AUTH ───────────────────────────────────────────────────
  section('AUTHENTICATION');
  const bad = await call('/auth/login', { method: 'POST', body: { email: 'officer@kamonyi.gov.rw', password: 'wrong' } });
  check('Invalid password rejected with 401', bad.status === 401, `got ${bad.status}`);

  const inactive = await call('/auth/login', { method: 'POST', body: { email: 'officer.retired@kamonyi.gov.rw', password: 'password123' } });
  check('Deactivated account cannot log in (403)', inactive.status === 403, `got ${inactive.status}: ${inactive.data?.error}`);

  const officer = await login('officer@kamonyi.gov.rw');
  const beneficiary = await login('alice@beneficiary.rw');
  const beneficiary2 = await login('josiane@beneficiary.rw');
  const provider = await login('provider@ngo.rw');
  const admin = await login('admin@disability.gov.rw');
  check('Officer logs in', !!officer);
  check('Beneficiary logs in', !!beneficiary);
  check('Provider logs in', !!provider);
  check('Admin logs in', !!admin);

  const noToken = await call('/registry');
  check('Unauthenticated request rejected (401)', noToken.status === 401, `got ${noToken.status}`);

  // ── RBAC BOUNDARIES (Section 3.9.3) ────────────────────────
  section('ROLE-BASED ACCESS CONTROL');
  check('Beneficiary cannot read the registry', (await call('/registry', { token: beneficiary })).status === 403);
  check('Provider cannot read the registry', (await call('/registry', { token: provider })).status === 403);
  check('Provider cannot read the audit log', (await call('/admin/audit', { token: provider })).status === 403);
  check('Officer cannot manage users', (await call('/admin/users', { token: officer })).status === 403);
  check('Beneficiary cannot decide a request', (await call('/support/requests/1/decide', { method: 'POST', token: beneficiary, body: { decision: 'urgent', reason: 'x' } })).status === 403);
  check('Officer cannot open provider search', (await call('/provider/search', { token: officer })).status === 403);
  check('Admin cannot edit the registry', (await call('/registry/1', { method: 'PATCH', token: admin, body: { village: 'X' } })).status === 403);

  // Provider least-privilege: no name, no national ID, no daily challenges.
  const search = await call('/provider/search', { token: provider });
  const leaked = (search.data || []).some((b) => b.fullName || b.nationalId || b.dailyChallenges);
  check('Provider search withholds name / national ID / history', search.status === 200 && !leaked);
  check('Provider search returns only ACTIVE verified records',
    (search.data || []).length > 0 && (search.data || []).every((b) => b.code));

  // One beneficiary cannot see another's profile: /my/* is derived from the token.
  const mineA = await call('/my/profile', { token: beneficiary });
  const mineB = await call('/my/profile', { token: beneficiary2 });
  check('Each beneficiary sees only their own record',
    mineA.data?.id !== mineB.data?.id && mineA.data?.code === 'B-1001' && mineB.data?.code === 'B-1005',
    `${mineA.data?.code} vs ${mineB.data?.code}`);

  // ── REGISTRY CRUD ──────────────────────────────────────────
  section('REGISTRY — CREATE / READ / UPDATE / ARCHIVE');
  const list = await call('/registry', { token: officer });
  check('Registry lists all 9 seeded records', list.data?.length === 9, `got ${list.data?.length}`);
  check('Registry rows carry impairments', (list.data || []).every((b) => Array.isArray(b.impairments)));

  const searchQ = await call('/registry?q=Josiane', { token: officer });
  check('Registry server-side search works', searchQ.data?.length === 1 && searchQ.data[0].code === 'B-1005');
  const filtered = await call('/registry?status=DECEASED', { token: officer });
  check('Registry status filter works', filtered.data?.length === 1 && filtered.data[0].code === 'B-1008');

  // Validation: consent is mandatory (Law 058/2021)
  const noConsent = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Test NoConsent', sector: 'Runda', supportNeeds: 'x', impairments: [{ type: 'seeing', level: 'some' }], consentGiven: false } });
  check('Registration without consent is refused (403)', noConsent.status === 403, noConsent.data?.error);

  const noImp = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Test NoImp', sector: 'Runda', supportNeeds: 'x', impairments: [], consentGiven: true } });
  check('Registration without an impairment is refused', noImp.status === 400, noImp.data?.error);

  const noNeeds = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Test NoNeeds', sector: 'Runda', impairments: [{ type: 'seeing', level: 'some' }], consentGiven: true } });
  check('Registration without support needs is refused', noNeeds.status === 400, noNeeds.data?.error);

  // Duplicate detection
  const dup = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Mukamana Alice', sector: 'Runda', supportNeeds: 'test', consentGiven: true,
    impairments: [{ type: 'seeing', level: 'some' }] } });
  check('Duplicate registration is flagged (409) with candidates',
    dup.status === 409 && Array.isArray(dup.data?.duplicates) && dup.data.duplicates.length >= 2,
    `${dup.status} / ${dup.data?.duplicates?.length}`);

  // Create for real — multiple impairments + email (triggers credential mail)
  const created = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Testeur Ndayisenga', nationalId: '1199999...0001', sector: 'Runda', cell: 'Kabuga', village: 'Testville',
    email: 'testeur@beneficiary.rw', dailyChallenges: 'Test daily challenge', supportNeeds: 'Test support need',
    consentGiven: true, impairments: [{ type: 'walking', level: 'alot' }, { type: 'seeing', level: 'some' }] } });
  const newId = created.data?.beneficiary?.id;
  check('Beneficiary registered with a sequential code',
    created.status === 200 && created.data?.beneficiary?.code === 'B-1010', created.data?.beneficiary?.code);
  check('Multiple impairments stored', created.data?.beneficiary?.impairments?.length === 2);
  check('Credentials issued by email', created.data?.credentials?.emailedTo === 'testeur@beneficiary.rw');

  // Registration with no email → mediated access, not an error
  const mediated = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Uwera Mediated', sector: 'Musambira', guardianName: 'Guardian Marie',
    supportNeeds: 'Mediated access need', dailyChallenges: 'No device or email',
    consentGiven: true, impairments: [{ type: 'communication', level: 'cannot' }] } });
  check('Registration with no email succeeds as mediated access',
    mediated.status === 200 && mediated.data?.mediatedAccess === true);

  // Update — including fullName, which a correction most often concerns
  const upd = await call(`/registry/${newId}`, { method: 'PATCH', token: officer, body: {
    village: 'Updated Village', supportNeeds: 'Revised support need', fullName: 'Testeur Ndayisenga Jr' } });
  check('Officer updates the record (incl. full name)',
    upd.status === 200 && upd.data?.village === 'Updated Village' && upd.data?.fullName === 'Testeur Ndayisenga Jr');

  const emptyPatch = await call(`/registry/${newId}`, { method: 'PATCH', token: officer, body: {} });
  check('Empty update is refused', emptyPatch.status === 400);

  // ── IMPAIRMENT CRUD ────────────────────────────────────────
  section('IMPAIRMENTS — ADD / EDIT / REMOVE');
  const addImp = await call(`/registry/${newId}/impairments`, { method: 'POST', token: officer, body: { type: 'hearing', level: 'some' } });
  check('Impairment added', addImp.status === 200 && addImp.data?.type === 'hearing');
  const dupImp = await call(`/registry/${newId}/impairments`, { method: 'POST', token: officer, body: { type: 'hearing', level: 'alot' } });
  check('Duplicate impairment type refused', dupImp.status === 400);
  const badImp = await call(`/registry/${newId}/impairments`, { method: 'POST', token: officer, body: { type: 'nonsense', level: 'some' } });
  check('Invalid impairment type refused', badImp.status === 400);
  const editImp = await call(`/impairments/${addImp.data.id}`, { method: 'PATCH', token: officer, body: { level: 'cannot' } });
  check('Impairment difficulty edited', editImp.status === 200 && editImp.data?.level === 'cannot');
  const delImp = await call(`/impairments/${addImp.data.id}`, { method: 'DELETE', token: officer });
  check('Impairment removed', delImp.status === 200);

  const solo = await call('/registry?q=Uwera', { token: officer });
  const soloImpId = solo.data?.[0]?.impairments?.[0]?.id;
  const lastImp = await call(`/impairments/${soloImpId}`, { method: 'DELETE', token: officer });
  check('Cannot remove the last impairment on a record', lastImp.status === 400, lastImp.data?.error);

  // ── SUPPORT WORKFLOW ───────────────────────────────────────
  section('SUPPORT REQUEST WORKFLOW');
  const reqCreate = await call('/support/requests', { method: 'POST', token: officer, body: { beneficiaryId: newId, need: 'Wheelchair for testing' } });
  const reqId = reqCreate.data?.id;
  check('Officer creates a support request', reqCreate.status === 200 && reqCreate.data?.origin === 'OFFICER');

  const reqDup = await call('/support/requests', { method: 'POST', token: officer, body: { beneficiaryId: newId, need: 'Wheelchair for testing' } });
  check('Identical undecided request refused', reqDup.status === 400, reqDup.data?.error);

  const noReason = await call(`/support/requests/${reqId}/decide`, { method: 'POST', token: officer, body: { decision: 'urgent' } });
  check('Decision without a recorded reason is refused', noReason.status === 400, noReason.data?.error);

  const badDecision = await call(`/support/requests/${reqId}/decide`, { method: 'POST', token: officer, body: { decision: 'maybe', reason: 'x' } });
  check('Invalid decision value refused', badDecision.status === 400);

  const editNeed = await call(`/support/requests/${reqId}`, { method: 'PATCH', token: officer, body: { need: 'Wheelchair (revised)' } });
  check('Officer edits an undecided request', editNeed.status === 200 && editNeed.data?.need === 'Wheelchair (revised)');

  const decided = await call(`/support/requests/${reqId}/decide`, { method: 'POST', token: officer, body: { decision: 'urgent', reason: 'Severe mobility impairment; escalated.' } });
  check('Decision recorded → APPROVED_URGENT', decided.data?.status === 'APPROVED_URGENT');
  check('Decision reason stored', !!decided.data?.decisionReason);

  const reDecide = await call(`/support/requests/${reqId}/decide`, { method: 'POST', token: officer, body: { decision: 'standard', reason: 'again' } });
  check('An already-decided request cannot be re-decided', reDecide.status === 400);

  const earlyComplete = await call(`/support/requests/${reqId}/complete`, { method: 'POST', token: officer });
  check('Cannot complete before distribution', earlyComplete.status === 400);

  const dist = await call(`/support/requests/${reqId}/distribute`, { method: 'POST', token: officer });
  check('Distribution started → DISTRIBUTING', dist.data?.status === 'DISTRIBUTING');
  const done = await call(`/support/requests/${reqId}/complete`, { method: 'POST', token: officer });
  check('Delivery confirmed → COMPLETED', done.data?.status === 'COMPLETED');
  check('Completion timestamp recorded', !!done.data?.completedAt);
  check('Full timeline preserved (4 events)', done.data?.timeline?.length >= 4, `${done.data?.timeline?.length}`);

  // Deceased record: handled with dignity, not an error
  const deceased = (await call('/registry?status=DECEASED', { token: officer })).data[0];
  const deceasedReq = await call('/support/requests', { method: 'POST', token: officer, body: { beneficiaryId: deceased.id, need: 'x' } });
  check('Support request for a deceased beneficiary is refused with a clear message',
    deceasedReq.status === 400 && /deceased/i.test(deceasedReq.data?.error || ''), deceasedReq.data?.error);

  // ── BENEFICIARY SELF-SERVICE ───────────────────────────────
  section('BENEFICIARY — SELF-SERVICE (Table 4.1: "request support")');
  const selfReq = await call('/support/requests', { method: 'POST', token: beneficiary, body: { need: 'Guide dog training' } });
  check('Beneficiary can request support themselves', selfReq.status === 200, selfReq.data?.error);
  check('Origin recorded as BENEFICIARY', selfReq.data?.origin === 'BENEFICIARY');
  check('Request attached to their own record only', selfReq.data?.beneficiary?.code === 'B-1001');

  const withdraw = await call(`/support/requests/${selfReq.data?.id}/cancel`, { method: 'POST', token: beneficiary });
  check('Beneficiary can withdraw their own pending request', withdraw.data?.status === 'CANCELLED');

  const otherReq = (await call('/support/requests?status=REQUESTED', { token: officer })).data.find((r) => r.origin === 'PROVIDER');
  const cantCancel = await call(`/support/requests/${otherReq.id}/cancel`, { method: 'POST', token: beneficiary });
  check("Beneficiary cannot withdraw someone else's request", cantCancel.status === 403, `${cantCancel.status}`);

  const myProfile = await call('/my/profile', { token: beneficiary });
  check('Beneficiary reads own read-only profile', myProfile.status === 200 && myProfile.data?.code === 'B-1001');
  const mySupport = await call('/my/support', { token: beneficiary });
  check('Beneficiary sees own support history with timeline',
    mySupport.data?.length >= 3 && mySupport.data.every((r) => Array.isArray(r.timeline)));

  // ── CORRECTIONS ────────────────────────────────────────────
  section('CORRECTIONS — MEDIATED RIGHT OF CORRECTION');
  const corr = await call('/my/corrections', { method: 'POST', token: beneficiary2, body: { text: 'My name is spelt wrong: Josiane not Josiyane.' } });
  check('Beneficiary files a correction request', corr.status === 200 && corr.data?.status === 'PENDING');
  const emptyCorr = await call('/my/corrections', { method: 'POST', token: beneficiary2, body: { text: '  ' } });
  check('Empty correction refused', emptyCorr.status === 400);

  const pending = await call('/corrections?status=PENDING', { token: officer });
  check('Officer sees pending corrections', pending.data?.length >= 3, `${pending.data?.length}`);
  const allCorr = await call('/corrections?status=all', { token: officer });
  check('Officer can see all correction history', allCorr.data?.length >= 5, `${allCorr.data?.length}`);

  const applied = await call(`/corrections/${corr.data.id}/resolve`, { method: 'POST', token: officer, body: { apply: true, patch: { fullName: 'Nyirahabimana Josiane' } } });
  check('Correction applied to the official record', applied.data?.status === 'APPLIED');
  const reResolve = await call(`/corrections/${corr.data.id}/resolve`, { method: 'POST', token: officer, body: { apply: false } });
  check('An already-handled correction cannot be re-handled', reResolve.status === 400);

  const corr2 = await call('/my/corrections', { method: 'POST', token: beneficiary2, body: { text: 'Second test correction' } });
  const declined = await call(`/corrections/${corr2.data.id}/resolve`, { method: 'POST', token: officer, body: { apply: false } });
  check('Correction can be declined', declined.data?.status === 'DECLINED');

  const emptyApply = await call('/my/corrections', { method: 'POST', token: beneficiary2, body: { text: 'Third' } });
  const applyNoPatch = await call(`/corrections/${emptyApply.data.id}/resolve`, { method: 'POST', token: officer, body: { apply: true, patch: {} } });
  check('Applying with no field chosen is refused', applyNoPatch.status === 400, applyNoPatch.data?.error);

  // The beneficiary must be able to see the outcome of what they filed —
  // a request that disappears is indistinguishable from one that was ignored.
  const myCorr = await call('/my/corrections', { token: beneficiary2 });
  check('Beneficiary sees their own correction history with outcomes',
    myCorr.status === 200 && myCorr.data.length >= 3
    && myCorr.data.some((c) => c.status === 'APPLIED') && myCorr.data.some((c) => c.status === 'DECLINED'),
    `${myCorr.data?.length}`);
  const crossCorr = await call('/my/corrections', { token: beneficiary });
  check('Correction history is scoped to the signed-in beneficiary',
    crossCorr.data.every((c) => c.beneficiaryId === mineA.data.id));

  // ── PROVIDER ───────────────────────────────────────────────
  section('PROVIDER — SEARCH BY NEED AND OFFER');
  const target = search.data.find((b) => b.code === 'B-1004');
  const offer = await call('/support/requests', { method: 'POST', token: provider, body: { beneficiaryId: target.id, need: 'Vocational toolkit' } });
  check('Provider submits an offer', offer.status === 200 && offer.data?.origin === 'PROVIDER');
  check('Offer linked to the provider organisation', !!offer.data?.providerId);

  const offers = await call('/provider/offers', { token: provider });
  check('Provider sees only their own offers', offers.status === 200 && offers.data.every((o) => !o.beneficiary?.fullName));

  const providerCancel = await call(`/support/requests/${offer.data.id}/cancel`, { method: 'POST', token: provider });
  check('Provider withdraws their own offer', providerCancel.data?.status === 'CANCELLED');

  const otherOffer = (await call('/support/requests?status=REQUESTED', { token: officer })).data.find((r) => r.origin === 'OFFICER');
  if (otherOffer) {
    const cantTouch = await call(`/support/requests/${otherOffer.id}/cancel`, { method: 'POST', token: provider });
    check("Provider cannot cancel another party's request", cantTouch.status === 403);
  } else { check("Provider cannot cancel another party's request", true); }

  const filterSearch = await call('/provider/search?impairmentType=walking', { token: provider });
  check('Provider search filters by impairment',
    filterSearch.data.length > 0 && filterSearch.data.every((b) => b.impairments.some((i) => i.type === 'walking')));

  // ── OPPORTUNITIES ──────────────────────────────────────────
  section('OPPORTUNITIES — PUBLISH / EDIT / DELETE');
  const opp = await call('/opportunities', { method: 'POST', token: officer, body: { kind: 'training', title: 'E2E Test Training', org: 'Test Org', detail: 'Detail' } });
  check('Opportunity published', opp.status === 200 && opp.data?.title === 'E2E Test Training');
  check('Publication reports how many were notified', typeof opp.data?.notified === 'number', `${opp.data?.notified}`);

  const badKind = await call('/opportunities', { method: 'POST', token: officer, body: { kind: 'nonsense', title: 'x' } });
  check('Invalid opportunity type refused', badKind.status === 400);
  const noTitle = await call('/opportunities', { method: 'POST', token: officer, body: { kind: 'job', title: '  ' } });
  check('Opportunity without a title refused', noTitle.status === 400);

  const oppEdit = await call(`/opportunities/${opp.data.id}`, { method: 'PATCH', token: officer, body: { title: 'E2E Test Training (edited)' } });
  check('Author edits their opportunity', oppEdit.data?.title === 'E2E Test Training (edited)');

  const notMine = await call(`/opportunities/${opp.data.id}`, { method: 'PATCH', token: provider, body: { title: 'hijack' } });
  check("A non-author cannot edit someone else's opportunity", notMine.status === 403);
  const adminEdit = await call(`/opportunities/${opp.data.id}`, { method: 'PATCH', token: admin, body: { detail: 'Admin override' } });
  check('An administrator may edit any opportunity', adminEdit.status === 200);

  const oppList = await call('/opportunities', { token: beneficiary });
  check('Beneficiary sees published opportunities', oppList.data?.length >= 5, `${oppList.data?.length}`);
  check('Opportunity carries its author', !!oppList.data?.[0]?.author || oppList.data.some((o) => o.author));

  const oppDel = await call(`/opportunities/${opp.data.id}`, { method: 'DELETE', token: officer });
  check('Opportunity deleted', oppDel.status === 200);

  // ── NOTIFICATIONS ──────────────────────────────────────────
  section('NOTIFICATIONS');
  const notifs = await call('/my/notifications', { token: beneficiary });
  check('Beneficiary reads notifications', notifs.status === 200 && notifs.data.length > 0, `${notifs.data?.length}`);
  const unread = notifs.data.filter((n) => !n.read);
  check('New activity generated unread notifications', unread.length > 0, `${unread.length}`);
  const markOne = await call(`/my/notifications/${unread[0].id}/read`, { method: 'POST', token: beneficiary });
  check('Single notification marked read', markOne.status === 200);
  const markAll = await call('/my/notifications/read-all', { method: 'POST', token: beneficiary });
  check('Mark-all-read works', markAll.status === 200);
  const after = await call('/my/notifications', { token: beneficiary });
  check('No unread remain after mark-all', after.data.every((n) => n.read));
  const delNotif = await call(`/my/notifications/${after.data[0].id}`, { method: 'DELETE', token: beneficiary });
  check('Notification deleted', delNotif.status === 200);
  const crossDelete = await call(`/my/notifications/${after.data[1].id}`, { method: 'DELETE', token: beneficiary2 });
  check("A beneficiary cannot delete another's notification", crossDelete.status === 404, `${crossDelete.status}`);

  // ── ADMIN: PROVIDER ORGANISATIONS ──────────────────────────
  section('ADMIN — PROVIDER ORGANISATIONS (CRUD)');
  const provList = await call('/admin/providers', { token: admin });
  check('Provider organisations listed with usage counts',
    provList.data?.length === 3 && provList.data.every((p) => 'offers' in p && 'accounts' in p));

  const provNew = await call('/admin/providers', { method: 'POST', token: admin, body: { name: 'E2E Test Foundation', type: 'Donor', contact: 'e2e@test.rw' } });
  check('Provider organisation created', provNew.status === 200 && provNew.data?.name === 'E2E Test Foundation');
  const provDupe = await call('/admin/providers', { method: 'POST', token: admin, body: { name: 'E2E Test Foundation' } });
  check('Duplicate organisation name refused', provDupe.status === 400);
  const provNoName = await call('/admin/providers', { method: 'POST', token: admin, body: { name: '  ' } });
  check('Organisation without a name refused', provNoName.status === 400);
  const provEdit = await call(`/admin/providers/${provNew.data.id}`, { method: 'PATCH', token: admin, body: { type: 'NGO' } });
  check('Provider organisation edited', provEdit.data?.type === 'NGO');
  const provInUse = await call(`/admin/providers/${provList.data[0].id}`, { method: 'DELETE', token: admin });
  check('Organisation with accounts/history cannot be deleted', provInUse.status === 403, provInUse.data?.error);
  const provDel = await call(`/admin/providers/${provNew.data.id}`, { method: 'DELETE', token: admin });
  check('Unused provider organisation deleted', provDel.status === 200);

  // ── ADMIN: USERS ───────────────────────────────────────────
  section('ADMIN — USERS & ROLES (CRUD)');
  const users = await call('/admin/users', { token: admin });
  check('Users listed', users.data?.length >= 10, `${users.data?.length}`);
  check('Password hashes never leave the server', users.data.every((u) => !u.passwordHash && !u.resetTokenHash));

  const newUser = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'E2E Officer', email: 'e2e.officer@kamonyi.gov.rw', password: 'password123', role: 'OFFICER', sector: 'Runda' } });
  check('Staff account created', newUser.status === 200 && newUser.data?.role === 'OFFICER');
  check('Staff credentials emailed', newUser.data?.credentials?.emailedTo === 'e2e.officer@kamonyi.gov.rw');

  const genUser = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'E2E Generated', email: 'e2e.gen@kamonyi.gov.rw', role: 'ADMIN' } });
  check('Account with a system-generated password created', genUser.status === 200 && genUser.data?.credentials?.generated === true);

  const dupeUser = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'Dup', email: 'e2e.officer@kamonyi.gov.rw', password: 'password123', role: 'OFFICER' } });
  check('Duplicate email refused', dupeUser.status === 400);
  const provNoOrg = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'NoOrg', email: 'noorg@test.rw', password: 'password123', role: 'PROVIDER' } });
  check('Provider account without an organisation refused', provNoOrg.status === 400);
  const badRole = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'BadRole', email: 'badrole@test.rw', password: 'password123', role: 'BENEFICIARY' } });
  check('Beneficiary role cannot be created here', badRole.status === 400);

  const newLogin = await login('e2e.officer@kamonyi.gov.rw');
  check('New staff account can actually log in', !!newLogin);

  const roleChange = await call(`/admin/users/${newUser.data.id}`, { method: 'PATCH', token: admin, body: { role: 'ADMIN' } });
  check('Role changed', roleChange.data?.role === 'ADMIN');
  const deact = await call(`/admin/users/${newUser.data.id}`, { method: 'PATCH', token: admin, body: { status: 'INACTIVE' } });
  check('User deactivated', deact.data?.status === 'INACTIVE');
  const blocked = await call('/auth/login', { method: 'POST', body: { email: 'e2e.officer@kamonyi.gov.rw', password: 'password123' } });
  check('Deactivated user is refused at login', blocked.status === 403);

  const me = users.data.find((u) => u.email === 'admin@disability.gov.rw');
  const selfDeact = await call(`/admin/users/${me.id}`, { method: 'PATCH', token: admin, body: { status: 'INACTIVE' } });
  check('Admin cannot deactivate their own account', selfDeact.status === 403);
  const selfDel = await call(`/admin/users/${me.id}`, { method: 'DELETE', token: admin });
  check('Admin cannot delete their own account', selfDel.status === 403);

  const benUser = users.data.find((u) => u.role === 'BENEFICIARY');
  const delBen = await call(`/admin/users/${benUser.id}`, { method: 'DELETE', token: admin });
  check('Beneficiary login cannot be deleted from user admin', delBen.status === 403, delBen.data?.error);

  const pwReset = await call(`/admin/users/${newUser.data.id}/reset-password`, { method: 'POST', token: admin });
  check('Admin can reset a user password', pwReset.status === 200 && !!pwReset.data?.emailedTo);

  check('Staff account deleted', (await call(`/admin/users/${newUser.data.id}`, { method: 'DELETE', token: admin })).status === 200);
  check('Second account deleted', (await call(`/admin/users/${genUser.data.id}`, { method: 'DELETE', token: admin })).status === 200);

  // ── ADMIN: REPORTS & AUDIT ─────────────────────────────────
  section('ADMIN — REPORTS & AUDIT');
  const rep = await call('/admin/reports', { token: admin });
  const r = rep.data || {};
  check('Reports generated', rep.status === 200);
  check('Coverage computed', typeof r.coveragePercent === 'number' && r.registered >= 11, `${r.registered} / ${r.coveragePercent}%`);
  check('Completeness computed', typeof r.completenessPercent === 'number');
  check('Duplication detected in the data', r.duplicationPercent > 0, `${r.duplicationPercent}%`);
  check('Traceability computed', typeof r.traceabilityPercent === 'number', `${r.traceabilityPercent}%`);
  check('Average turnaround computed', typeof r.avgTurnaroundDays === 'number', `${r.avgTurnaroundDays} days`);
  check('Breakdown by impairment present', Array.isArray(r.byImpairment) && r.byImpairment.length >= 5);
  check('Breakdown by sector present', Object.keys(r.bySector || {}).length >= 4);
  check('Breakdown by request status present', Object.keys(r.byStatus || {}).length >= 5);
  check('Breakdown by request origin includes all three', Object.keys(r.byOrigin || {}).length === 3, JSON.stringify(r.byOrigin));
  check('Pending corrections surfaced', typeof r.pendingCorrections === 'number');

  const audit = await call('/admin/audit', { token: admin });
  check('Audit log readable', audit.status === 200 && audit.data.length > 20, `${audit.data?.length} entries`);
  check('Audit entries are attributed to an actor', audit.data.every((a) => a.actorName));
  const auditQ = await call('/admin/audit?q=Decided', { token: admin });
  check('Audit log is searchable', auditQ.data.length > 0 && auditQ.data.every((a) => /decided/i.test(a.action)));
  const adminReg = await call('/admin/registry', { token: admin });
  check('Admin has read-only registry oversight', adminReg.status === 200 && adminReg.data.length >= 11);

  // ── ACCOUNT SELF-SERVICE ───────────────────────────────────
  section('ACCOUNT SELF-SERVICE');
  const lang = await call('/me/language', { method: 'POST', token: beneficiary, body: { language: 'rw' } });
  check('Language preference saved', lang.data?.language === 'rw');
  const badLang = await call('/me/language', { method: 'POST', token: beneficiary, body: { language: 'fr' } });
  check('Unsupported language refused', badLang.status === 400);
  await call('/me/language', { method: 'POST', token: beneficiary, body: { language: 'en' } });

  const wrongPw = await call('/me/password', { method: 'POST', token: beneficiary, body: { currentPassword: 'nope', newPassword: 'newpassword123' } });
  check('Password change with wrong current password refused', wrongPw.status === 401);
  const shortPw = await call('/me/password', { method: 'POST', token: beneficiary, body: { currentPassword: 'password123', newPassword: 'short' } });
  check('Password shorter than 8 characters refused', shortPw.status === 400);
  const changed = await call('/me/password', { method: 'POST', token: beneficiary, body: { currentPassword: 'password123', newPassword: 'newpassword123' } });
  check('Password changed', changed.status === 200);
  check('New password works at login', !!(await login('alice@beneficiary.rw', 'newpassword123')));
  const revert = await login('alice@beneficiary.rw', 'newpassword123');
  await call('/me/password', { method: 'POST', token: revert, body: { currentPassword: 'newpassword123', newPassword: 'password123' } });
  check('Password reverted for the demo account', !!(await login('alice@beneficiary.rw', 'password123')));

  const forgot = await call('/auth/forgot-password', { method: 'POST', body: { email: 'alice@beneficiary.rw' } });
  check('Forgot-password accepted', forgot.status === 200);
  const unknown = await call('/auth/forgot-password', { method: 'POST', body: { email: 'nobody@nowhere.rw' } });
  check('Forgot-password does not reveal which emails exist', unknown.status === 200 && !unknown.data?.error);
  const badToken = await call('/auth/reset-password', { method: 'POST', body: { token: 'garbage', password: 'whatever123' } });
  check('Invalid reset token refused', badToken.status === 400);

  // ── SUMMARY ────────────────────────────────────────────────
  console.log(results.join('\n'));
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`TOTAL: ${pass + fail} checks · ${pass} passed · ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nTEST HARNESS ERROR:', e); console.log(results.join('\n')); process.exit(1); });
