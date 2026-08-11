// ─────────────────────────────────────────────────────────────
// reports.service.js — Objective 4: announcements & opportunities,
// plus the reporting metrics from Table 3.3 (coverage, completeness,
// duplication, traceability, turnaround).
// ─────────────────────────────────────────────────────────────
import { fn, col, Op } from 'sequelize';
import {
  sequelize, Opportunity, OpportunityApplication, Beneficiary, Impairment, SupportRequest,
  Notification, AuditLog, User, Correction, Provider,
} from '../models/index.js';
import { AppError, audit, afterCommit, clampLimit } from './registry.service.js';
import { applicationWindow } from './application.service.js';
import { sendOpportunity, sendOpportunityOpen } from './notify.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };
const KINDS = ['scholarship', 'job', 'training', 'announcement'];

// ── Opportunities / announcements ────────────────────────────
// Each posting carries how many people have applied and whether it is still
// open. A closed opportunity that still shows an Apply button wastes the time
// of the person least able to spare it.
export async function listOpportunities() {
  const [rows, counts] = await Promise.all([
    Opportunity.findAll({
      include: [{ model: User, as: 'author', attributes: ['id', 'fullName', 'role'] }],
      order: [['createdAt', 'DESC']],
    }),
    OpportunityApplication.findAll({
      attributes: ['opportunityId', 'status', [fn('COUNT', col('id')), 'n']],
      group: ['opportunityId', 'status'], raw: true,
    }),
  ]);

  const tallies = {};
  for (const c of counts) {
    const t = tallies[c.opportunityId] || (tallies[c.opportunityId] = { total: 0, pending: 0, accepted: 0 });
    const n = Number(c.n);
    t.total += n;
    if (['SUBMITTED', 'SHORTLISTED'].includes(c.status)) t.pending += n;
    if (c.status === 'ACCEPTED') t.accepted += n;
  }

  return rows.map((o) => {
    const w = applicationWindow(o);
    return {
      ...o.toJSON(),
      applications: tallies[o.id]?.total || 0,
      pendingApplications: tallies[o.id]?.pending || 0,
      acceptedApplications: tallies[o.id]?.accepted || 0,
      open: w.open,
      closedReason: w.open ? null : w.reason,
    };
  });
}

// Only the author (or an administrator) may edit or remove an opportunity.
function assertOwner(user, o) {
  if (o.postedById !== user.id && user.role !== 'ADMIN') forbid('You can only change opportunities you published');
}

// A closing date in the past would publish an opportunity that is shut before
// anybody sees it; a negative number of places is not a number of places.
function normaliseWindow(data, { deadline, slots, acceptsApplications }, { isNew } = {}) {
  if (deadline !== undefined) {
    if (!deadline) data.deadline = null;
    else {
      if (Number.isNaN(new Date(deadline).getTime())) bad('The closing date is not a valid date');
      if (isNew && new Date(`${deadline}T23:59:59`) < new Date()) bad('The closing date has already passed');
      data.deadline = deadline;
    }
  }
  if (slots !== undefined) {
    if (slots === null || slots === '') data.slots = null;
    else {
      const n = Number(slots);
      if (!Number.isInteger(n) || n < 1) bad('The number of places must be a whole number of at least 1');
      data.slots = n;
    }
  }
  if (acceptsApplications !== undefined) data.acceptsApplications = !!acceptsApplications;
  return data;
}

export async function updateOpportunity(user, id, { kind, title, org, detail, deadline, slots, acceptsApplications }) {
  const o = await Opportunity.findByPk(id);
  if (!o) notFound('Opportunity not found');
  assertOwner(user, o);
  const data = {};
  if (kind !== undefined) { if (!KINDS.includes(kind)) bad('Invalid opportunity type'); data.kind = kind; }
  if (title !== undefined) { if (!title.trim()) bad('A title is required'); data.title = title.trim(); }
  if (org !== undefined) data.org = org;
  if (detail !== undefined) data.detail = detail;
  normaliseWindow(data, { deadline, slots, acceptsApplications });
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
export async function publishOpportunity(user, { kind, title, org, detail, deadline, slots, acceptsApplications }) {
  if (!KINDS.includes(kind)) bad('Invalid opportunity type');
  if (!title?.trim()) bad('A title is required');

  const window = normaliseWindow({}, { deadline, slots, acceptsApplications }, { isNew: true });
  // An announcement is information to read; the other three are things a
  // person must be able to act on, so they open for applications by default.
  const opensForApplications = kind === 'announcement'
    ? false
    : (window.acceptsApplications ?? true);

  const out = await sequelize.transaction(async (t) => {
    const o = await Opportunity.create({
      kind, title: title.trim(), org, detail, postedById: user.id,
      deadline: window.deadline ?? null, slots: window.slots ?? null,
      acceptsApplications: opensForApplications,
    }, { transaction: t });

    const all = await Beneficiary.findAll({ attributes: ['id', 'email'], where: { status: 'ACTIVE' }, transaction: t });
    const icon = { scholarship: '🎓', job: '💼', training: '📚', announcement: '📣' }[kind];
    if (all.length) {
      await Notification.bulkCreate(
        all.map((b) => ({
          beneficiaryId: b.id, icon,
          // The in-app message says what to do next, not merely that something
          // exists — "you can apply" is the half that was missing.
          message: opensForApplications
            ? `New ${kind} you can apply for: ${title.trim()}`
            : `New ${kind}: ${title.trim()}`,
        })),
        { transaction: t },
      );
    }
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Published ${kind}: ${title.trim()} (${all.length} notified)`, entity: `Opportunity:${o.id}` });
    return { o, recipients: all.filter((b) => b.email).map((b) => b.email) };
  });

  // Email is best-effort and must not fail the publication.
  afterCommit(async () => {
    for (const to of out.recipients) {
      await (opensForApplications
        ? sendOpportunityOpen({ to, kind, title: title.trim(), org, detail, deadline: window.deadline, slots: window.slots })
        : sendOpportunity({ to, kind, title: title.trim(), org, detail }));
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
  const [beneficiaries, requests, impairments, corrections, users, providers, opportunities, apps] = await Promise.all([
    Beneficiary.findAll({ attributes: ['id', 'sector', 'dailyChallenges', 'supportNeeds', 'nationalId', 'fullName', 'verified', 'status', 'email'] }),
    SupportRequest.findAll({ attributes: ['status', 'origin', 'decisionReason', 'createdAt', 'completedAt'] }),
    Impairment.findAll({ attributes: ['type', [fn('COUNT', col('id')), 'count']], group: ['type'] }),
    Correction.findAll({ attributes: ['status'] }),
    User.count(),
    Provider.count(),
    Opportunity.count(),
    OpportunityApplication.findAll({ attributes: ['status', 'origin', 'beneficiaryId'] }),
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
    // ── Opportunity uptake ──
    // Publishing a scholarship is not the outcome; somebody applying for it
    // is. `reachPercent` is the share of registered beneficiaries who have
    // ever applied to anything, and it is the honest measure of whether
    // publication is reaching people or merely being performed.
    // `officerMediatedPercent` is the share of applications an officer had to
    // submit on somebody's behalf — a high figure is not a failure, it is the
    // size of the population that a self-service-only system would have
    // silently excluded.
    totalApplications: apps.length,
    applicationsPending: apps.filter((a) => ['SUBMITTED', 'SHORTLISTED'].includes(a.status)).length,
    applicationsAccepted: apps.filter((a) => a.status === 'ACCEPTED').length,
    applicationsDeclined: apps.filter((a) => a.status === 'DECLINED').length,
    applicantReachPercent: beneficiaries.length
      ? Math.round((new Set(apps.map((a) => a.beneficiaryId)).size / beneficiaries.length) * 100)
      : 0,
    officerMediatedApplicationsPercent: apps.length
      ? Math.round((apps.filter((a) => a.origin === 'OFFICER').length / apps.length) * 100)
      : 0,
    byApplicationStatus: tally(apps, 'status'),
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

// The audit log is append-only and grows without bound, so it is searched and
// paged in the database rather than by pulling a window into memory and
// filtering it — the previous approach searched only the newest 200 rows,
// which quietly made older entries unfindable exactly when an investigation
// needs them.
export async function auditLog({ q, limit = 50, offset = 0 } = {}) {
  const term = String(q || '').trim();
  const where = term
    ? {
      [Op.or]: [
        { action: { [Op.like]: `%${term}%` } },
        { actorName: { [Op.like]: `%${term}%` } },
        { entity: { [Op.like]: `%${term}%` } },
      ],
    }
    : {};
  const [rows, total] = await Promise.all([
    AuditLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: clampLimit(limit, 50, 500),
      offset: Math.max(0, Number(offset) || 0),
    }),
    AuditLog.count({ where }),
  ]);
  return { rows, total };
}

// ══════════════════════════════════════════════════════════════
// OFFICER OVERVIEW — the officer's own workload, in one call.
// Landing straight on the registry hides the two things that are
// actually time-critical: requests waiting on a decision, and
// correction requests from people whose record is wrong right now.
// ══════════════════════════════════════════════════════════════
export async function officerOverview(officer) {
  // Registry counts are district-wide. An officer with a sector also gets
  // their own share as a separate figure rather than instead of it: scoping
  // the only number on the screen means a mis-set sector column shows a
  // confident zero, and a zero on a coverage dashboard reads as "nobody here
  // has a disability" rather than as "this filter matched nothing".
  const scope = officer.sector ? { sector: officer.sector } : null;
  const [
    beneficiaries, activeBeneficiaries, unverified,
    pendingRequests, approved, distributing, completed,
    pendingCorrections, opportunities, pendingApplications, recent, inMySector,
  ] = await Promise.all([
    Beneficiary.count(),
    Beneficiary.count({ where: { status: 'ACTIVE' } }),
    Beneficiary.count({ where: { verified: false } }),
    SupportRequest.count({ where: { status: 'REQUESTED' } }),
    SupportRequest.count({ where: { status: { [Op.in]: ['APPROVED_URGENT', 'APPROVED_STANDARD'] } } }),
    SupportRequest.count({ where: { status: 'DISTRIBUTING' } }),
    SupportRequest.count({ where: { status: 'COMPLETED' } }),
    Correction.count({ where: { status: 'PENDING' } }),
    Opportunity.count(),
    OpportunityApplication.count({ where: { status: { [Op.in]: ['SUBMITTED', 'SHORTLISTED'] } } }),
    SupportRequest.findAll({
      where: { status: 'REQUESTED' },
      include: [{ model: Beneficiary, as: 'beneficiary', attributes: ['code', 'fullName', 'sector'] }],
      order: [['createdAt', 'ASC']],   // oldest first: the longest wait is the one that matters
      limit: 5,
    }),
    scope ? Beneficiary.count({ where: scope }) : Promise.resolve(null),
  ]);

  return {
    sector: officer.sector || null,
    inMySector,
    beneficiaries,
    activeBeneficiaries,
    unverified,
    pendingRequests,
    approved,
    distributing,
    completed,
    pendingCorrections,
    opportunities,
    pendingApplications,
    oldestWaiting: recent.map((r) => ({
      id: r.id, code: r.code, need: r.need, origin: r.origin, createdAt: r.createdAt,
      beneficiary: r.beneficiary && {
        code: r.beneficiary.code, fullName: r.beneficiary.fullName, sector: r.beneficiary.sector,
      },
    })),
  };
}

// Small counts the sidebar shows as badges, so an officer can see there is
// work waiting without first opening the page that holds it.
export async function officerBadges() {
  const [requests, corrections, applications] = await Promise.all([
    SupportRequest.count({ where: { status: 'REQUESTED' } }),
    Correction.count({ where: { status: 'PENDING' } }),
    OpportunityApplication.count({ where: { status: { [Op.in]: ['SUBMITTED', 'SHORTLISTED'] } } }),
  ]);
  return { requests, corrections, applications };
}

// The beneficiary's unread count, for the header bell.
export async function myUnreadCount(user) {
  if (!user.beneficiaryId) return { unread: 0 };
  const unread = await Notification.count({ where: { beneficiaryId: user.beneficiaryId, read: false } });
  return { unread };
}
