// ─────────────────────────────────────────────────────────────
// support.service.js — Objective 3: support request, coordination
// and transparent distribution. Every officer decision must carry
// a recorded reason: a decision that must be explained is a
// decision that must be justifiable.
// ─────────────────────────────────────────────────────────────
import { Op } from 'sequelize';
import {
  sequelize, SupportRequest, RequestEvent, Beneficiary, Impairment, Provider,
} from '../models/index.js';
import { AppError, audit, notify, nextCode } from './registry.service.js';

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

// ══════════════════════════════════════════════════════════════
// PROVIDER SEARCH — least privilege. A provider can identify a
// candidate for assistance WITHOUT reading the full personal record:
// no name, no national ID, no daily challenges.
// ══════════════════════════════════════════════════════════════
export async function providerSearch({ impairmentType, sector } = {}) {
  const rows = await Beneficiary.findAll({
    where: { verified: true, status: 'ACTIVE', ...(sector && { sector }) },
    attributes: ['id', 'code', 'sector', 'supportNeeds'],   // deliberately limited
    include: [{
      model: Impairment, as: 'impairments', attributes: ['type', 'level'],
      ...(impairmentType && { where: { type: impairmentType } }),
    }],
    order: [['createdAt', 'DESC']],
  });
  return rows;
}

// ── Create a request: provider offer, or officer-initiated ────
// Officer-initiated matters: a request-driven system only serves
// those able to make a request.
export async function createRequest(user, { beneficiaryId, need }) {
  if (!need?.trim()) bad('The support need is required');
  const b = await Beneficiary.findByPk(beneficiaryId);
  if (!b) notFound('Beneficiary not found');

  const origin = user.role === 'PROVIDER' ? 'PROVIDER' : 'OFFICER';
  if (origin === 'PROVIDER' && !user.providerId) forbid('Your account is not linked to a provider organisation');

  return sequelize.transaction(async (t) => {
    const code = await nextCode(t, 'request', 'R', 500);
    const r = await SupportRequest.create({
      code, beneficiaryId, need: need.trim(), origin,
      providerId: origin === 'PROVIDER' ? user.providerId : null, status: 'REQUESTED',
    }, { transaction: t });
    await event(t, r.id, origin === 'PROVIDER' ? 'Provider submitted a support offer' : 'Requested by officer', user.id);
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Created support request ${code} for ${b.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, beneficiaryId, '🤝', 'A support request was created for you — it is under review.');
    return r;
  });
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

  return sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'REQUESTED') bad(`Cannot decide a request that is already ${r.status}`);

    await r.update({ status: d.status, decisionReason: reason.trim(), decidedById: officer.id }, { transaction: t });
    await event(t, r.id, `${d.label} (reason recorded)`, officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Decided ${r.code} → ${d.status}`, entity: `SupportRequest:${r.id}`, meta: { reason: reason.trim() } });
    await notify(t, r.beneficiaryId, decision === 'ineligible' ? 'ℹ️' : '✅',
      decision === 'ineligible' ? `Support request not approved. Reason: ${reason.trim()}` : 'Your support request was approved.');
    return r;
  });
}

// ── Distribution → completion (support history preserved) ─────
export async function startDistribution(officer, id) {
  return sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (!['APPROVED_URGENT', 'APPROVED_STANDARD'].includes(r.status)) bad('Only an approved request can be distributed');
    await r.update({ status: 'DISTRIBUTING' }, { transaction: t });
    await event(t, r.id, 'Distribution started with the provider', officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Started distribution ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, '📦', 'Your support is being distributed.');
    return r;
  });
}

export async function complete(officer, id) {
  return sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'DISTRIBUTING') bad('Only a request under distribution can be completed');
    await r.update({ status: 'COMPLETED', completedAt: new Date() }, { transaction: t });
    await event(t, r.id, 'Delivery confirmed — support history stored', officer.id);
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Completed ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, '🎉', 'Your support has been delivered and recorded.');
    return r;
  });
}

// ── Cancel a request still awaiting a decision ───────────────
// An officer may cancel any pending request; a provider may cancel only
// their own offer. A decided request keeps its history and cannot be cancelled.
export async function cancelRequest(user, id) {
  return sequelize.transaction(async (t) => {
    const r = await SupportRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) notFound('Support request not found');
    if (r.status !== 'REQUESTED') bad('Only a request still awaiting a decision can be cancelled');
    if (user.role === 'PROVIDER' && r.providerId !== user.providerId) forbid('You can only cancel your own offers');
    await r.update({ status: 'CANCELLED' }, { transaction: t });
    await event(t, r.id, 'Request cancelled', user.id);
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Cancelled request ${r.code}`, entity: `SupportRequest:${r.id}` });
    await notify(t, r.beneficiaryId, 'ℹ️', 'A support request was withdrawn.');
    return r;
  });
}

// ── Reads, scoped by role ────────────────────────────────────
export const listAll = ({ status } = {}) =>
  SupportRequest.findAll({ where: { ...(status && { status }) }, include: fullInclude, order: [['createdAt', 'DESC']] });

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
