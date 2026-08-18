// End-to-end functional test of the IDMS backend across all four roles.
const BASE = 'http://localhost:4000/api';
let pass = 0, fail = 0;
const fails = [];

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL', name, detail || ''); }
}
async function login(email) {
  const r = await api('POST', '/auth/login', null, { email, password: 'password123' });
  return r.data && r.data.token;
}

(async () => {
  console.log('== AUTH ==');
  const officer = await login('officer@kamonyi.gov.rw');
  const beneficiary = await login('alice@beneficiary.rw');
  const provider = await login('provider@ngo.rw');
  const admin = await login('admin@disability.gov.rw');
  check('officer login', !!officer);
  check('beneficiary login', !!beneficiary);
  check('provider login', !!provider);
  check('admin login', !!admin);
  const badLogin = await api('POST', '/auth/login', null, { email: 'officer@kamonyi.gov.rw', password: 'wrong' });
  check('reject bad password', badLogin.status === 401, 'status ' + badLogin.status);

  console.log('== OFFICER: registry + full support workflow ==');
  let r = await api('GET', '/registry', officer);
  check('officer list registry', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  const uniq = Date.now().toString().slice(-6);
  r = await api('POST', '/registry', officer, {
    fullName: 'Test Beneficiary ' + uniq, sector: 'Runda', cell: 'Kabuga', village: 'Test',
    supportNeeds: 'Wheelchair for mobility', consentGiven: true,
    impairments: [{ type: 'walking', level: 'alot' }], nationalId: '1' + uniq + '00000000',
  });
  const benId = r.data && (r.data.id || (r.data.beneficiary && r.data.beneficiary.id));
  check('officer register beneficiary', r.status === 200 && !!benId, 'status ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 120));
  r = await api('POST', '/registry', officer, { fullName: 'NoConsent', sector: 'Runda', supportNeeds: 'x', consentGiven: false, impairments: [{ type: 'seeing', level: 'some' }] });
  check('reject registration without consent', r.status === 403 || r.status === 400, 'status ' + r.status);
  r = await api('POST', '/registry/check-duplicate', officer, { fullName: 'Test Beneficiary ' + uniq, sector: 'Runda' });
  check('duplicate check finds the new record', r.status === 200 && Array.isArray(r.data) && r.data.length >= 1, 'status ' + r.status);
  r = await api('PATCH', '/registry/' + benId, officer, { village: 'Updated Village' });
  check('officer update beneficiary', r.status === 200, 'status ' + r.status);
  r = await api('POST', '/registry/' + benId + '/status', officer, { status: 'ACTIVE' });
  check('officer set beneficiary verified/status', r.status === 200, 'status ' + r.status);

  // support workflow
  r = await api('POST', '/support/requests', officer, { beneficiaryId: benId, need: 'Wheelchair' });
  check('officer create support request', r.status === 200 && r.data && r.data.id, 'status ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 120));
  const reqId = r.data && r.data.id;
  r = await api('POST', '/support/requests/' + reqId + '/decide', officer, { decision: 'urgent', reason: 'Priority mobility need confirmed' });
  check('officer decide (approve urgent) with reason', r.status === 200, 'status ' + r.status);
  r = await api('POST', '/support/requests/' + reqId + '/decide', officer, { decision: 'urgent', reason: '' });
  check('reject decide without reason', r.status === 400, 'status ' + r.status);
  r = await api('POST', '/support/requests/' + reqId + '/distribute', officer);
  check('officer start distribution', r.status === 200, 'status ' + r.status);
  r = await api('POST', '/support/requests/' + reqId + '/complete', officer);
  check('officer complete request', r.status === 200, 'status ' + r.status);
  r = await api('GET', '/support/requests', officer);
  check('officer list all requests', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);

  r = await api('POST', '/opportunities', officer, { kind: 'training', title: 'Digital skills ' + uniq, org: 'Kamonyi', detail: 'Basic ICT' });
  check('officer publish opportunity', r.status === 200 && r.data && r.data.id, 'status ' + r.status);
  const oppId = r.data && r.data.id;

  console.log('== BENEFICIARY: profile, support, correction, notifications ==');
  r = await api('GET', '/my/profile', beneficiary);
  check('beneficiary view own profile', r.status === 200 && r.data, 'status ' + r.status);
  r = await api('GET', '/my/support', beneficiary);
  check('beneficiary list own support', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  r = await api('POST', '/my/corrections', beneficiary, { text: 'My village name is spelled wrong' });
  check('beneficiary request correction', r.status === 200 && r.data && r.data.id, 'status ' + r.status);
  const corrId = r.data && r.data.id;
  r = await api('GET', '/my/notifications', beneficiary);
  check('beneficiary list notifications', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  if (r.data && r.data[0]) {
    const nr = await api('POST', '/my/notifications/' + r.data[0].id + '/read', beneficiary);
    check('beneficiary mark notification read', nr.status === 200, 'status ' + nr.status);
  }
  r = await api('GET', '/opportunities', beneficiary);
  check('beneficiary sees opportunities', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);

  console.log('== OFFICER resolves the beneficiary correction ==');
  r = await api('GET', '/corrections', officer);
  check('officer list pending corrections', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  if (corrId) {
    r = await api('POST', '/corrections/' + corrId + '/resolve', officer, { apply: true, patch: { village: 'Corrected Village' } });
    check('officer resolve correction (apply)', r.status === 200, 'status ' + r.status);
  }

  console.log('== PROVIDER: search + offer + own offers ==');
  r = await api('GET', '/provider/search', provider);
  check('provider search recorded needs', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  check('provider search hides sensitive fields', r.status === 200 && (!r.data[0] || r.data[0].nationalId === undefined), 'leaked nationalId');
  r = await api('POST', '/support/requests', provider, { beneficiaryId: benId, need: 'Donated wheelchair (provider offer)' });
  check('provider create offer request', r.status === 200 && r.data && r.data.id, 'status ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 120));
  r = await api('GET', '/provider/offers', provider);
  check('provider list own offers', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);

  console.log('== ADMIN: reports, users CRUD, audit ==');
  r = await api('GET', '/admin/reports', admin);
  check('admin reports', r.status === 200 && r.data, 'status ' + r.status);
  r = await api('GET', '/admin/audit', admin);
  check('admin audit log', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  r = await api('GET', '/admin/users', admin);
  check('admin list users', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  r = await api('GET', '/admin/providers', admin);
  check('admin list providers', r.status === 200 && Array.isArray(r.data), 'status ' + r.status);
  r = await api('POST', '/admin/users', admin, { fullName: 'New Officer ' + uniq, email: 'newofficer' + uniq + '@kamonyi.gov.rw', role: 'OFFICER', sector: 'Runda', password: 'password123' });
  check('admin create user', r.status === 200 && r.data && r.data.id, 'status ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 120));
  const newUserId = r.data && r.data.id;
  if (newUserId) {
    r = await api('PATCH', '/admin/users/' + newUserId, admin, { status: 'INACTIVE' });
    check('admin deactivate user', r.status === 200, 'status ' + r.status);
    const relog = await api('POST', '/auth/login', null, { email: 'newofficer' + uniq + '@kamonyi.gov.rw', password: 'password123' });
    check('deactivated user cannot log in', relog.status !== 200 || !relog.data.token, 'status ' + relog.status);
  }

  console.log('== RBAC negative checks ==');
  r = await api('GET', '/registry', beneficiary);
  check('beneficiary blocked from officer registry', r.status === 403, 'status ' + r.status);
  r = await api('GET', '/admin/reports', officer);
  check('officer blocked from admin reports', r.status === 403, 'status ' + r.status);
  r = await api('GET', '/provider/search', officer);
  check('officer blocked from provider search', r.status === 403, 'status ' + r.status);
  r = await api('GET', '/my/profile', officer);
  check('officer blocked from beneficiary profile', r.status === 403, 'status ' + r.status);
  r = await api('GET', '/registry', null);
  check('no token blocked', r.status === 401, 'status ' + r.status);

  console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
