// Exercises the real notification paths end to end so the delivered
// messages can be inspected in an actual inbox. Every email goes through
// the same code the app uses — nothing is faked here.
const BASE = 'http://127.0.0.1:4000/api';

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (email) => (await call('/auth/login', { method: 'POST', body: { email, password: 'password123' } })).data?.token;

(async () => {
  const officer = await login('officer@kamonyi.gov.rw');
  const beneficiary = await login('alice@beneficiary.rw');
  const admin = await login('admin@disability.gov.rw');
  const sent = [];

  // 1. Registration → credentials email (template 1)
  const reg = await call('/registry', { method: 'POST', token: officer, body: {
    fullName: 'Mailcheck Uwimana', sector: 'Runda', cell: 'Kabuga', village: 'Mailtest',
    email: 'mailcheck@beneficiary.rw', dailyChallenges: 'Demonstration record for the email check.',
    supportNeeds: 'Assistive device assessment', consentGiven: true,
    impairments: [{ type: 'seeing', level: 'alot' }] } });
  sent.push(['1. Beneficiary credentials', reg.status === 200]);
  const id = reg.data?.beneficiary?.id;

  // 2. Support request created (template 4)
  const req = await call('/support/requests', { method: 'POST', token: officer, body: {
    beneficiaryId: id, need: 'White cane and orientation training' } });
  sent.push(['2. Support request created', req.status === 200]);

  // 3. Officer decision with a recorded reason (template 5)
  const dec = await call(`/support/requests/${req.data?.id}/decide`, { method: 'POST', token: officer, body: {
    decision: 'urgent', reason: 'Severe visual impairment with no current mobility aid; escalated for priority support.' } });
  sent.push(['3. Decision — approved urgent', dec.status === 200]);

  // 4. Distribution started (template 6)
  const dist = await call(`/support/requests/${req.data?.id}/distribute`, { method: 'POST', token: officer });
  sent.push(['4. Distribution started', dist.status === 200]);

  // 5. Delivery confirmed (template 7)
  const done = await call(`/support/requests/${req.data?.id}/complete`, { method: 'POST', token: officer });
  sent.push(['5. Delivery confirmed', done.status === 200]);

  // 6. Beneficiary files a correction → officer alert (template 9)
  const corr = await call('/my/corrections', { method: 'POST', token: beneficiary, body: {
    text: 'My village is recorded as Nyakabungo but it should be Gasharu.' } });
  sent.push(['6. Correction filed → officer alert', corr.status === 200]);

  // 7. Officer applies it → beneficiary told the outcome (template 8)
  const res = await call(`/corrections/${corr.data?.id}/resolve`, { method: 'POST', token: officer, body: {
    apply: true, patch: { village: 'Gasharu' } } });
  sent.push(['7. Correction applied → beneficiary told', res.status === 200]);

  // 8. Staff account created (template 11)
  const staff = await call('/admin/users', { method: 'POST', token: admin, body: {
    fullName: 'Mailcheck Officer', email: 'mailcheck.officer@kamonyi.gov.rw', role: 'OFFICER', sector: 'Runda' } });
  sent.push(['8. Staff account credentials', staff.status === 200]);

  // 9. Password reset (template 2)
  const reset = await call('/auth/forgot-password', { method: 'POST', body: { email: 'alice@beneficiary.rw' } });
  sent.push(['9. Password reset code', reset.status === 200]);

  // 10. Opportunity published → mailed to every beneficiary with an address (template 3)
  const opp = await call('/opportunities', { method: 'POST', token: admin, body: {
    kind: 'training', title: 'Assistive technology training — Kamonyi', org: 'NCPD',
    detail: 'Two-week course covering screen readers, magnification and mobile accessibility. Transport is provided.' } });
  sent.push([`10. Opportunity published (${opp.data?.notified} recipients)`, opp.status === 200]);

  console.log('\nNotification paths exercised:\n');
  for (const [name, ok] of sent) console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  console.log(`\n${sent.filter(([, ok]) => ok).length}/${sent.length} workflows triggered their email.`);
  console.log('Delivery is asynchronous; give it a few seconds.\n');

  // Clean up the demo rows so the seeded dataset stays tidy.
  await new Promise((r) => setTimeout(r, 9000));
  if (staff.data?.id) await call(`/admin/users/${staff.data.id}`, { method: 'DELETE', token: admin });
  if (opp.data?.id) await call(`/opportunities/${opp.data.id}`, { method: 'DELETE', token: admin });
  if (id) await call(`/registry/${id}/status`, { method: 'POST', token: officer, body: { status: 'ARCHIVED' } });
  console.log('Demo rows cleaned up.');
})();
