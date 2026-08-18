const BASE = 'https://idms-production.up.railway.app/api';
const call = async (p, o = {}) => {
  const r = await fetch(BASE + p, { method: o.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
(async () => {
  const ben = (await call('/auth/login', { method: 'POST', body: { email: 'alice@beneficiary.rw', password: 'password123' } })).data?.token;
  const adm = (await call('/auth/login', { method: 'POST', body: { email: 'admin@disability.gov.rw', password: 'password123' } })).data?.token;
  console.log('login (beneficiary/admin):', !!ben, !!adm);

  // Endpoints that exist ONLY in the new build
  const c = await call('/my/corrections', { token: ben });
  console.log(`GET  /my/corrections        -> ${c.status}  ${c.status === 200 ? 'NEW code' : 'OLD code (404)'}`);

  const r = await call('/admin/reports', { token: adm });
  const hasNew = r.data && 'byOrigin' in r.data && 'pendingCorrections' in r.data;
  console.log(`GET  /admin/reports         -> ${r.status}  ${hasNew ? 'NEW fields present' : 'OLD shape'}`);

  const p = await call('/admin/providers', { token: adm });
  const hasCounts = Array.isArray(p.data) && p.data[0] && 'offers' in p.data[0];
  console.log(`GET  /admin/providers       -> ${p.status}  ${hasCounts ? 'NEW shape (usage counts)' : 'OLD shape'}`);

  const reg = await call('/admin/registry', { token: adm });
  console.log(`GET  /admin/registry        -> ${reg.status}  ${reg.status === 200 ? 'NEW oversight route' : 'OLD code'}`);
})();
