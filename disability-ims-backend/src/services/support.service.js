// ─────────────────────────────────────────────────────────────
// support.service.js — Objective 3: support request, coordination
// and transparent distribution. Every officer decision must carry
// a recorded reason: a decision that must be explained is a
// decision that must be justifiable.
//
// Requests have three legitimate origins, and all three matter:
//  · BENEFICIARY — the person asks for what they need themselves;
//  · PROVIDER    — an offer matched to a recorded need;
//  · OFFICER     — because a request-driven system serves only those
//                  able to make a request, and the person least able
//                  to ask is frequently the person who most needs it.
// ─────────────────────────────────────────────────────────────
import {
  sequelize, SupportRequest, RequestEvent, Beneficiary, Impairment, Provider,
} from '../models/index.js';
import { AppError, audit, notify, nextCode, afterCommit, officerFor } from './registry.service.js';
import {
  sendRequestCreated, sendDecision, sendDistributing, sendCompleted, sendOfferFiled,
} from './notify.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };

async function event(t, requestId, label, actorId) {
  await RequestEvent.create({ requestId, label, actorId }, { transaction: t });
}

const fullInclude = [
  { model: Beneficiary, as: 'beneficiary', include: [{ model: Impairment, as: 'impairments' }] },
  { model: RequestEvent, as: 'timeline' },
  { model: Provider, as: 'provider' },
];

const reload = (id) => SupportRequest.findByPk(id, { include: fullInclude });

// ══════════════════════════════════════════════════════════════
// PROVIDER SEARCH — least privilege. A provider can identify a
// candidate for assistance WITHOUT reading the full personal record:
// no name, no national ID, no daily challenges.
// ══════════════════════════════════════════════════════════════
export async function providerSearch({ impairmentType, sector } = {}) {
  return Beneficiary.findAll({
    where: { verified: true, status: 'ACTIVE', ...(sector && sector !== 'all' && { sector }) },
    attributes: ['id', 'code', 'sector', 'supportNeeds'],   // deliberately limited
    include: [{
      model: Impairment, as: 'impairments', attributes: ['type', 'level'],
      ...(impairmentType && impairmentType !== 'all' && { where: { type: impairmentType } }),
    }],
    order: [['createdAt', 'DESC']],
  });
}

// ── Create a request ──────────────────────────────────────────
export async function createRequest(user, { beneficiaryId, need }) {
  if (!need?.trim()) bad('The support need is required');

  // A beneficiary may only ever request for themselves.
  if (user.role === 'BENEFICIARY' && !user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  const targetId = user.role === 'BENEFICIARY' ? user.beneficiaryId : beneficiaryId;

  const b = await Beneficiary.findByPk(targetId);
  if (!b) notFound('Beneficiary not found');
  if (b.status !== 'ACTIVE') bad(`Cannot create a support request for a record that is ${b.status.toLowerCase()}`);

  const origin = user.role === 'PROVIDER' ? 'PROVIDER' : user.role === 'BENEFICIARY' ? 'BENEFICIARY' : 'OFFICER';
  if (origin === 'PROVIDER' && !user.providerId) forbid('Your account is not linked to a provider organisation');

  // Asking twice for the same undecided thing is a mistake, not a second need.
  const open = await SupportRequest.findOne({
    where: { beneficiaryId: b.id, need: need.trim(), status: 'REQUESTED' },
  });
  if (open) bad(`An identical request (${open.code}) is already awaiting a decision`);

  const label = {
    PROVIDER: 'Provider submitted a support offer',
    BENEFICIARY: 'Requested by the beneficiary',
    OFFICER: 'Requested by officer',
  }[origin];

  const created = await sequelize.transaction(async (t) => {
    const code = await nextCode(t, 'request', 'R', 500);
    const r = await SupportRequest.create({
      code, beneficiaryId: b.id, need: need.trim(), origin,
      providerId: origin === 'PROVIDER' ? user.providerId : null, status: 'REQUESTED',
    }, { transaction: t });
    await event(t, r.id, label, user.id);
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Created support request ${code} for ${b.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, b.id, '🤝', origin === 'BENEFICIARY'
      ? 'Your support request was submitted and is under review.'
      : 'A support request was created for you — it is under review.');
    return r;
  });

  afterCommit(async () => {
    if (b.email) await sendRequestCreated({ to: b.email, code: created.code, need: created.need, byRole: origin });
    // A provider offer or a beneficiary request is only useful once an
    // officer knows it is waiting for a decision.
    if (origin !== 'OFFICER') {
      const officer = await officerFor(b);
      if (officer?.email) {
        const provider = origin === 'PROVIDER' ? await Provider.findByPk(user.providerId) : null;
        await sendOfferFiled({
          to: officer.email, code: created.code, need: created.need,
          provider: provider?.name || `${b.fullName} (beneficiary)`, beneficiaryCode: b.code,
        });
      }
    }
  });

  return reload(created.id);
}

// ══════════════════════════════════════════════════════════════
// OFFICER DECISION — urgent / standard / ineligible, reason required.
// ══════════════════════════════════════════════════════════════
const DECISIONS = {
  urgent:     { status: 'APPROVED_URGENT',    label: 'Approved — urgent, escalated for priority support' },
  standard:   { status: 'APPROVED_STANDARD',  label: 'Approved — queued for scheduled distribution' },
  ineligible: { status: 'INELIGIBLE',         label: 'Recorded as not eligible — beneficiary notified with the reason' },
};

export async function decide(officer, id, decision, reason) {
  const d = DECISIONS[decision];
  if (!d) bad('Decision must be urgent, standard or ineligible');
  if (!reason?.trim()) bad('A decision reason is required and is shown to the beneficiary');

  const out = await sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'REQUESTED') bad(`Cannot decide a request that is already ${r.status}`);

    await r.update({ status: d.status, decisionReason: reason.trim(), decidedById: officer.id }, { transaction: t });
    await event(t, r.id, `${d.label} (reason recorded)`, officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Decided ${r.code} → ${d.status}`, entity: `SupportRequest:${r.id}`, meta: { reason: reason.trim() } });
    await notify(t, r.beneficiaryId, decision === 'ineligible' ? 'ℹ️' : '✅',
      decision === 'ineligible' ? `Support request not approved. Reason: ${reason.trim()}` : 'Your support request was approved.');

    const b = await Beneficiary.findByPk(r.beneficiaryId, { transaction: t });
    return { r, email: b?.email };
  });

  if (out.email) {
    afterCommit(() => sendDecision({
      to: out.email, code: out.r.code, need: out.r.need, decision, reason: reason.trim(),
    }));
  }
  return reload(out.r.id);
}

// ── Distribution → completion (support history preserved) ─────
export async function startDistribution(officer, id) {
  const out = await sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (!['APPROVED_URGENT', 'APPROVED_STANDARD'].includes(r.status)) bad('Only an approved request can be distributed');
    await r.update({ status: 'DISTRIBUTING' }, { transaction: t });
    await event(t, r.id, 'Distribution started with the provider', officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Started distribution ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, '📦', 'Your support is being distributed.');
    const b = await Beneficiary.findByPk(r.beneficiaryId, { transaction: t });
    const p = r.providerId ? await Provider.findByPk(r.providerId, { transaction: t }) : null;
    return { r, email: b?.email, provider: p?.name };
  });

  if (out.email) {
    afterCommit(() => sendDistributing({ to: out.email, code: out.r.code, need: out.r.need, provider: out.provider }));
  }
  return reload(out.r.id);
}

export async function complete(officer, id) {
  const out = await sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'DISTRIBUTING') bad('Only a request under distribution can be completed');
    await r.update({ status: 'COMPLETED', completedAt: new Date() }, { transaction: t });
    await event(t, r.id, 'Delivery confirmed — support history stored', officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Completed ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, '🎉', 'Your support has been delivered and recorded.');
    const b = await Beneficiary.findByPk(r.beneficiaryId, { transaction: t });
    return { r, email: b?.email };
  });

  if (out.email) {
    afterCommit(() => sendCompleted({ to: out.email, code: out.r.code, need: out.r.need }));
  }
  return reload(out.r.id);
}

// ── Cancel a request still awaiting a decision ───────────────
// An officer may cancel any pending request; a provider may cancel only
// their own offer; a beneficiary may withdraw only the request they made
// themselves. A decided request keeps its history and cannot be cancelled.
export async function cancelRequest(user, id) {
  const out = await sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'REQUESTED') bad('Only a request still awaiting a decision can be cancelled');
    if (user.role === 'PROVIDER' && r.providerId !== user.providerId) forbid('You can only cancel your own offers');
    if (user.role === 'BENEFICIARY') {
      if (r.beneficiaryId !== user.beneficiaryId) forbid('You can only withdraw your own requests');
      if (r.origin !== 'BENEFICIARY') forbid('Only a request you made yourself can be withdrawn');
    }

    await r.update({ status: 'CANCELLED' }, { transaction: t });
    await event(t, r.id, 'Request cancelled', user.id);
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Cancelled request ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, 'ℹ️', 'A support request was withdrawn.');
    return r;
  });
  return reload(out.id);
}

// ── Officer edits the recorded need before a decision is taken ─
export async function updateRequest(officer, id, { need }) {
  if (!need?.trim()) bad('The support need is required');
  const out = await sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'REQUESTED') bad('Only a request still awaiting a decision can be edited');
    const before = r.need;
    await r.update({ need: need.trim() }, { transaction: t });
    await event(t, r.id, 'Recorded need revised by the officer', officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Edited need on ${r.code}`, entity: `SupportRequest:${r.id}`, meta: { before, after: need.trim() } });
    return r;
  });
  return reload(out.id);
}

// ── Reads, scoped by role ────────────────────────────────────
export async function listAll({ status, q } = {}) {
  const rows = await SupportRequest.findAll({
    where: { ...(status && status !== 'all' && { status }) },
    include: fullInclude,
    order: [['createdAt', 'DESC']],
  });
  if (!q) return rows;
  const term = String(q).toLowerCase();
  return rows.filter((r) => [r.code, r.need, r.beneficiary?.fullName, r.beneficiary?.code]
    .filter(Boolean).join(' ').toLowerCase().includes(term));
}

export async function listMine(user) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  return SupportRequest.findAll({
    where: { beneficiaryId: user.beneficiaryId },
    include: [{ model: RequestEvent, as: 'timeline' }, { model: Provider, as: 'provider', attributes: ['name'] }],
    order: [['createdAt', 'DESC']],
  });
}

// A provider sees only their own offers, and only limited beneficiary fields.
export async function listProviderOffers(user) {
  if (!user.providerId) forbid('Your account is not linked to a provider organisation');
  return SupportRequest.findAll({
    where: { providerId: user.providerId },
    include: [
      { model: Beneficiary, as: 'beneficiary', attributes: ['code', 'sector'] },
      { model: RequestEvent, as: 'timeline' },
    ],
    order: [['createdAt', 'DESC']],
  });
}
