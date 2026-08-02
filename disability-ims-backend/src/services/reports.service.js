// ─────────────────────────────────────────────────────────────
// reports.service.js — Objective 4: announcements & opportunities,
// plus the reporting metrics from Table 3.3 (coverage, completeness,
// duplication, traceability, turnaround).
// ─────────────────────────────────────────────────────────────
import { fn, col } from 'sequelize';
import {
  sequelize, Opportunity, Beneficiary, Impairment, SupportRequest,
  Notification, AuditLog, User, Correction, Provider,
} from '../models/index.js';
import { AppError, audit, afterCommit } from './registry.service.js';
import { sendOpportunity } from './notify.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };
const KINDS = ['scholarship', 'job', 'training', 'announcement'];

// ── Opportunities / announcements ────────────────────────────
export const listOpportunities = () =>
  Opportunity.findAll({
    include: [{ model: User, as: 'author', attributes: ['id', 'fullName', 'role'] }],
    order: [['createdAt', 'DESC']],
  });

// Only the author (or an administrator) may edit or remove an opportunity.
function assertOwner(user, o) {
  if (o.postedById !== user.id && user.role !== 'ADMIN') forbid('You can only change opportunities you published');
}

export async function updateOpportunity(user, id, { kind, title, org, detail }) {
  const o = await Opportunity.findByPk(id);
  if (!o) notFound('Opportunity not found');
  assertOwner(user, o);
  const data = {};
  if (kind !== undefined) { if (!KINDS.includes(kind)) bad('Invalid opportunity type'); data.kind = kind; }
  if (title !== undefined) { if (!title.trim()) bad('A title is required'); data.title = title.trim(); }
  if (org !== undefined) data.org = org;
  if (detail !== undefined) data.detail = detail;
  if (!Object.keys(data).length) bad('Nothing to update');
  return sequelize.transaction(async (t) => {
    await o.update(data, { transaction: t });
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Updated opportunity: ${o.title}`, entity: `Opportunity:${o.id}` });
    return o;
  });
}

export async function deleteOpportunity(user, id) {
  const o = await Opportunity.findByPk(id);
  if (!o) notFound('Opportunity not found');
  assertOwner(user, o);
  return sequelize.transaction(async (t) => {
    const title = o.title;
    await o.destroy({ transaction: t });
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Deleted opportunity: ${title}`, entity: `Opportunity:${id}` });
    return { ok: true };
  });
}

// Publishing pushes an in-app notification to every registered
// beneficiary and emails those with an address on file: the information
// failure is distribution, not supply. Only ACTIVE records are notified —
// there is no dignity in emailing an opportunity to a deceased person.
export async function publishOpportunity(user, { kind, title, org, detail }) {
  if (!KINDS.includes(kind)) bad('Invalid opportunity type');
  if (!title?.trim()) bad('A title is required');

  const out = await sequelize.transaction(async (t) => {
    const o = await Opportunity.create({ kind, title: title.trim(), org, detail, postedById: user.id }, { transaction: t });
    const all = await Beneficiary.findAll({ attributes: ['id', 'email'], where: { status: 'ACTIVE' }, transaction: t });
    const icon = { scholarship: '🎓', job: '💼', training: '📚', announcement: '📣' }[kind];
    if (all.length) {
      await Notification.bulkCreate(
        all.map((b) => ({ beneficiaryId: b.id, icon, message: `New ${kind}: ${title.trim()}` })),
        { transaction: t },
      );
    }
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Published ${kind}: ${title.trim()} (${all.length} notified)`, entity: `Opportunity:${o.id}` });
    return { o, recipients: all.filter((b) => b.email).map((b) => b.email) };
  });

  // Email is best-effort and must not fail the publication.
  afterCommit(async () => {
    for (const to of out.recipients) {
      await sendOpportunity({ to, kind, title: title.trim(), org, detail });
    }
  });

  return { ...out.o.toJSON(), notified: out.recipients.length };
}

// ── Notifications ────────────────────────────────────────────
export const myNotifications = (user) =>
  Notification.findAll({ where: { beneficiaryId: user.beneficiaryId }, order: [['createdAt', 'DESC']] });

export async function markRead(user, id) {
  const [n] = await Notification.update({ read: true }, { where: { id, beneficiaryId: user.beneficiaryId } });
  if (!n) notFound('Notification not found');
  return { ok: true };
}

export async function markAllRead(user) {
  const [n] = await Notification.update({ read: true }, { where: { beneficiaryId: user.beneficiaryId, read: false } });
  return { ok: true, updated: n };
}

export async function deleteNotification(user, id) {
  const n = await Notification.destroy({ where: { id, beneficiaryId: user.beneficiaryId } });
  if (!n) notFound('Notification not found');
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════
// REPORTS — Table 3.3 measures. ESTIMATED_POPULATION is the district
// estimate the coverage figure is measured against (Table 3.1: 2,400).
// ══════════════════════════════════════════════════════════════
const ESTIMATED_POPULATION = Number(process.env.ESTIMATED_PWD_POPULATION || 2400);
const DAY = 24 * 60 * 60 * 1000;

export async function reports() {
  const [beneficiaries, requests, impairments, corrections, users, providers, opportunities] = await Promise.all([
    Beneficiary.findAll({ attributes: ['id', 'sector', 'dailyChallenges', 'supportNeeds', 'nationalId', 'fullName', 'verified', 'status', 'email'] }),
    SupportRequest.findAll({ attributes: ['status', 'origin', 'decisionReason', 'createdAt', 'completedAt'] }),
    Impairment.findAll({ attributes: ['type', [fn('COUNT', col('id')), 'count']], group: ['type'] }),
    Correction.findAll({ attributes: ['status'] }),
    User.count(),
    Provider.count(),
    Opportunity.count(),
  ]);

  const active = beneficiaries.filter((b) => b.status === 'ACTIVE');

  // Record completeness: mandatory fields populated
  const complete = beneficiaries.filter((b) => b.sector && b.dailyChallenges && b.supportNeeds).length;

  // Duplication rate. This must apply the same rule as the duplicate
  // detector at registration (registry.service.findDuplicates), otherwise
  // the report contradicts the warning the officer was shown: a record
  // counts as a duplicate if it shares a national ID with an earlier
  // record OR the same name within the same sector. Keying on national ID
  // alone misses the common case, where the duplicate exists precisely
  // because the ID was mistyped, or was never captured at all.
  const seenIds = new Set();
  const seenNames = new Set();
  let duplicates = 0;
  for (const b of beneficiaries) {
    const idKey = b.nationalId ? `id:${b.nationalId}` : null;
    const nameKey = b.fullName && b.sector ? `nm:${b.fullName.trim().toLowerCase()}|${b.sector}` : null;
    if ((idKey && seenIds.has(idKey)) || (nameKey && seenNames.has(nameKey))) duplicates++;
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.add(nameKey);
  }

  // Traceability: decided requests that carry a recorded reason
  const decided = requests.filter((r) => !['REQUESTED', 'CANCELLED'].includes(r.status));
  const traceable = decided.filter((r) => r.decisionReason && r.decisionReason.trim()).length;

  // Turnaround: days from request to recorded completion
  const done = requests.filter((r) => r.status === 'COMPLETED' && r.completedAt);
  const avgTurnaround = done.length
    ? +(done.reduce((s, r) => s + (new Date(r.completedAt) - new Date(r.createdAt)) / DAY, 0) / done.length).toFixed(1)
    : null;

  const tally = (rows, key) => rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] || 0) + 1 }), {});

  return {
    registered: beneficiaries.length,
    activeBeneficiaries: active.length,
    estimatedPopulation: ESTIMATED_POPULATION,
    coveragePercent: +((beneficiaries.length / ESTIMATED_POPULATION) * 100).toFixed(1),
    completenessPercent: beneficiaries.length ? Math.round((complete / beneficiaries.length) * 100) : 0,
    duplicationPercent: beneficiaries.length ? +((duplicates / beneficiaries.length) * 100).toFixed(1) : 0,
    verifiedPercent: beneficiaries.length ? Math.round((beneficiaries.filter((b) => b.verified).length / beneficiaries.length) * 100) : 0,
    // How many beneficiaries can actually reach their own record directly.
    // The gap is the measure of how much of the population depends on
    // guardian- or officer-mediated access.
    withAccountPercent: beneficiaries.length ? Math.round((beneficiaries.filter((b) => b.email).length / beneficiaries.length) * 100) : 0,
    supportDelivered: requests.filter((r) => r.status === 'COMPLETED').length,
    totalRequests: requests.length,
    traceabilityPercent: decided.length ? Math.round((traceable / decided.length) * 100) : 0,
    avgTurnaroundDays: avgTurnaround,
    pendingCorrections: corrections.filter((c) => c.status === 'PENDING').length,
    totalUsers: users,
    totalProviders: providers,
    totalOpportunities: opportunities,
    byStatus: tally(requests, 'status'),
    byOrigin: tally(requests, 'origin'),
    bySector: tally(beneficiaries, 'sector'),
    byRecordStatus: tally(beneficiaries, 'status'),
    byImpairment: impairments.map((r) => ({ type: r.type, count: Number(r.get('count')) })),
  };
}

// ── Admin: users & roles, audit ──────────────────────────────
export const listUsers = () =>
  User.findAll({ attributes: { exclude: ['passwordHash', 'resetTokenHash', 'resetTokenExpiry'] }, order: [['id', 'ASC']] });

export const auditLog = ({ q, limit = 200 } = {}) =>
  AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: Math.min(Number(limit) || 200, 500) })
    .then((rows) => (q
      ? rows.filter((r) => `${r.action} ${r.actorName} ${r.entity}`.toLowerCase().includes(String(q).toLowerCase()))
      : rows));
