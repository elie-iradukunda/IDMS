// ─────────────────────────────────────────────────────────────
// registry.service.js — beneficiary registration & the official record.
// Objective 1 & 2: registry data model, duplicate detection,
// automatic account creation with credentials issued by email,
// and the mediated right of correction.
// ─────────────────────────────────────────────────────────────
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import {
  sequelize, Beneficiary, Impairment, User, Correction,
  Notification, AuditLog, Counter,
} from '../models/index.js';
import { sendCredentials, sendCorrectionFiled, sendCorrectionResolved } from './notify.js';

export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };

export async function audit(t, { actorId, actorName = 'System', action, entity, meta }) {
  await AuditLog.create({ actorId, actorName, action, entity, meta }, { transaction: t });
}
export async function notify(t, beneficiaryId, icon, message) {
  if (!beneficiaryId) return;
  await Notification.create({ beneficiaryId, icon, message }, { transaction: t });
}

// Email is sent AFTER the transaction commits, never inside it: an SMTP
// round-trip must not hold a database transaction open, and a message
// must not be sent about a change that was subsequently rolled back.
// Failures are swallowed by notify.js, so this never breaks a workflow.
export const afterCommit = (fn) => { Promise.resolve().then(fn).catch(() => {}); };

// The officer to route a beneficiary's correction to: the officer who
// registered them, otherwise any active officer for their sector, otherwise
// any active officer. A request that reaches nobody is a request that failed.
export async function officerFor(beneficiary) {
  if (beneficiary.registeredById) {
    const u = await User.findByPk(beneficiary.registeredById);
    if (u && u.status === 'ACTIVE' && u.email) return u;
  }
  if (beneficiary.sector) {
    const bySector = await User.findOne({ where: { role: 'OFFICER', status: 'ACTIVE', sector: beneficiary.sector } });
    if (bySector) return bySector;
  }
  return User.findOne({ where: { role: 'OFFICER', status: 'ACTIVE' } });
}

// Atomic sequential codes: B-1001, R-501
export async function nextCode(t, key, prefix, start) {
  const [c] = await Counter.findOrCreate({ where: { key }, defaults: { value: start }, transaction: t, lock: t.LOCK.UPDATE });
  const value = c.value + 1;
  await c.update({ value }, { transaction: t });
  return `${prefix}-${value}`;
}

// ── Duplicate detection (a registry must be a single record) ──
// Matches on national ID, or on same name within the same sector.
export async function findDuplicates({ nationalId, fullName, sector, excludeId }) {
  const or = [];
  if (nationalId) or.push({ nationalId });
  if (fullName && sector) or.push({ fullName, sector });
  if (!or.length) return [];
  return Beneficiary.findAll({
    where: { [Op.or]: or, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['id', 'code', 'fullName', 'sector', 'village'],
  });
}

// ══════════════════════════════════════════════════════════════
// REGISTER — officer registers a beneficiary; the system creates
// the account and emails credentials. Consent is mandatory because
// disability status is sensitive personal data (Law 058/2021).
// ══════════════════════════════════════════════════════════════
export async function registerBeneficiary(officer, data) {
  const { fullName, nationalId, sector, cell, village, guardianName, email,
          dailyChallenges, supportNeeds, impairments = [], consentGiven, allowDuplicate } = data;

  if (!fullName?.trim() || !sector?.trim()) bad('Full name and sector are required');
  if (!supportNeeds?.trim()) bad('Support needs are required — a disability category alone cannot say what a person needs');
  if (!consentGiven) forbid('Informed consent is required before storing sensitive disability data (Law No. 058/2021)');
  if (!impairments.length) bad('At least one impairment (type + difficulty level) is required');

  if (email) {
    const taken = await User.findOne({ where: { email: email.trim().toLowerCase() } });
    if (taken) bad('That email address already has an account on the system');
  }

  const dups = await findDuplicates({ nationalId, fullName, sector });
  if (dups.length && !allowDuplicate) {
    throw Object.assign(new AppError(409, 'Possible duplicate record found'), { duplicates: dups });
  }

  // Credentials are generated here so they can be emailed after commit.
  const tempPassword = email ? crypto.randomBytes(6).toString('base64url') : null;

  const result = await sequelize.transaction(async (t) => {
    const code = await nextCode(t, 'beneficiary', 'B', 1000);
    const b = await Beneficiary.create({
      code, fullName: fullName.trim(), nationalId, sector, cell, village, guardianName,
      email: email ? email.trim().toLowerCase() : null, dailyChallenges, supportNeeds,
      verified: true, consentGiven: true, consentAt: new Date(), registeredById: officer.id,
    }, { transaction: t });

    for (const im of impairments) {
      await Impairment.create({ beneficiaryId: b.id, type: im.type, level: im.level }, { transaction: t });
    }

    // Automatic account creation + credentials issued by email.
    // Where there is no email, guardian/officer-mediated access is the
    // legitimate path — we do not fail the registration.
    if (email) {
      await User.create({
        fullName: b.fullName, email: b.email, role: 'BENEFICIARY', beneficiaryId: b.id,
        passwordHash: await bcrypt.hash(tempPassword, 10),
      }, { transaction: t });
      await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Credentials emailed for ${b.code}`, entity: `Beneficiary:${b.id}` });
    }

    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Registered beneficiary ${b.code} (${b.fullName})`, entity: `Beneficiary:${b.id}` });
    await notify(t, b.id, '📧', 'Your record was registered and your account created.');
    return b;
  });

  if (email) {
    afterCommit(() => sendCredentials({ to: result.email, name: result.fullName, code: result.code, tempPassword }));
  }

  return {
    beneficiary: await getBeneficiary(result.id),
    credentials: email ? { emailedTo: result.email } : null,
    mediatedAccess: !email,
  };
}

// ── Reads ────────────────────────────────────────────────────
const withImpairments = [{ model: Impairment, as: 'impairments' }];

export const listRegistry = ({ q, sector, status } = {}) =>
  Beneficiary.findAll({
    where: {
      ...(sector && sector !== 'all' && { sector }),
      ...(status && status !== 'all' && { status }),
      ...(q && {
        [Op.or]: [
          { fullName: { [Op.like]: `%${q}%` } },
          { code: { [Op.like]: `%${q}%` } },
          { supportNeeds: { [Op.like]: `%${q}%` } },
          { village: { [Op.like]: `%${q}%` } },
        ],
      }),
    },
    include: withImpairments, order: [['createdAt', 'DESC']],
  });

export async function getBeneficiary(id) {
  const b = await Beneficiary.findByPk(id, { include: withImpairments });
  if (!b) notFound('Beneficiary not found');
  return b;
}

// The beneficiary's own view — same data, read-only permission.
export async function myProfile(user) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  return getBeneficiary(user.beneficiaryId);
}

// ── Officer updates the official record (every change audited) ─
// fullName and nationalId are editable because a correction request is
// most often about exactly those fields — a right of correction that
// cannot reach the misspelt name is not a right of correction.
const EDITABLE = ['fullName', 'nationalId', 'sector', 'cell', 'village', 'guardianName',
                  'email', 'dailyChallenges', 'supportNeeds', 'verified', 'status'];

export async function updateBeneficiary(officer, id, patch) {
  const data = {};
  for (const k of EDITABLE) if (patch[k] !== undefined) data[k] = patch[k];
  if (!Object.keys(data).length) bad('Nothing to update');
  if (data.fullName !== undefined && !String(data.fullName).trim()) bad('Full name cannot be empty');
  if (data.sector !== undefined && !String(data.sector).trim()) bad('Sector cannot be empty');
  if (data.status !== undefined && !['ACTIVE', 'ARCHIVED', 'DECEASED'].includes(data.status)) {
    bad('Status must be ACTIVE, ARCHIVED or DECEASED');
  }

  // Changing the record email must keep the linked login account in step,
  // otherwise the beneficiary silently loses access to their own record.
  if (data.email !== undefined && data.email) {
    data.email = String(data.email).trim().toLowerCase();
    const clash = await User.findOne({ where: { email: data.email } });
    if (clash && clash.beneficiaryId !== id) bad('That email address is already used by another account');
  }

  return sequelize.transaction(async (t) => {
    const b = await Beneficiary.findByPk(id, { transaction: t });
    if (!b) notFound('Beneficiary not found');
    const before = Object.fromEntries(Object.keys(data).map((k) => [k, b[k]]));
    await b.update(data, { transaction: t });

    const linked = await User.findOne({ where: { beneficiaryId: b.id }, transaction: t });
    if (linked) {
      const sync = {};
      if (data.fullName !== undefined) sync.fullName = data.fullName;
      if (data.email) sync.email = data.email;
      if (Object.keys(sync).length) await linked.update(sync, { transaction: t });
    }

    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Updated record ${b.code}`, entity: `Beneficiary:${b.id}`, meta: { before, after: data } });
    await notify(t, b.id, '📝', 'Your record was updated by your local officer.');
    return Beneficiary.findByPk(b.id, { include: withImpairments, transaction: t });
  });
}

// Archive / restore / mark deceased. A registry that is not maintained
// decays; archiving removes a record from active coordination without
// destroying its support history, and a deceased beneficiary is handled
// with dignity rather than left as an active case.
export async function setBeneficiaryStatus(officer, id, status) {
  if (!['ACTIVE', 'ARCHIVED', 'DECEASED'].includes(status)) bad('Status must be ACTIVE, ARCHIVED or DECEASED');
  return sequelize.transaction(async (t) => {
    const b = await Beneficiary.findByPk(id, { transaction: t });
    if (!b) notFound('Beneficiary not found');
    await b.update({ status }, { transaction: t });
    // A deceased or archived beneficiary must not keep an active login.
    if (status !== 'ACTIVE') {
      await User.update({ status: 'INACTIVE' }, { where: { beneficiaryId: b.id }, transaction: t });
    } else {
      await User.update({ status: 'ACTIVE' }, { where: { beneficiaryId: b.id }, transaction: t });
    }
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Beneficiary ${b.code} status → ${status}`, entity: `Beneficiary:${b.id}` });
    return Beneficiary.findByPk(b.id, { include: withImpairments, transaction: t });
  });
}

// ══════════════════════════════════════════════════════════════
// IMPAIRMENTS — a record whose impairment list cannot be corrected is
// a record that goes stale. An impairment can be added, its difficulty
// level revised, or an incorrect row removed — never leaving a
// beneficiary with no impairment at all, which the registry requires.
// ══════════════════════════════════════════════════════════════
const TYPES = ['seeing', 'hearing', 'walking', 'cognition', 'selfcare', 'communication'];
const LEVELS = ['some', 'alot', 'cannot'];

export async function addImpairment(officer, beneficiaryId, { type, level }) {
  if (!TYPES.includes(type)) bad('Invalid impairment type');
  if (!LEVELS.includes(level)) bad('Difficulty must be some, alot or cannot');
  return sequelize.transaction(async (t) => {
    const b = await Beneficiary.findByPk(beneficiaryId, { transaction: t });
    if (!b) notFound('Beneficiary not found');
    const existing = await Impairment.findOne({ where: { beneficiaryId, type }, transaction: t });
    if (existing) bad('That impairment type is already recorded for this beneficiary');
    const im = await Impairment.create({ beneficiaryId, type, level }, { transaction: t });
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Added impairment ${type}/${level} to ${b.code}`, entity: `Impairment:${im.id}` });
    return im;
  });
}

export async function updateImpairment(officer, id, { level }) {
  if (!LEVELS.includes(level)) bad('Difficulty must be some, alot or cannot');
  return sequelize.transaction(async (t) => {
    const im = await Impairment.findByPk(id, { transaction: t });
    if (!im) notFound('Impairment not found');
    const b = await Beneficiary.findByPk(im.beneficiaryId, { transaction: t });
    await im.update({ level }, { transaction: t });
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Changed ${im.type} difficulty → ${level} on ${b?.code}`, entity: `Impairment:${im.id}` });
    return im;
  });
}

export async function deleteImpairment(officer, id) {
  return sequelize.transaction(async (t) => {
    const im = await Impairment.findByPk(id, { transaction: t });
    if (!im) notFound('Impairment not found');
    const count = await Impairment.count({ where: { beneficiaryId: im.beneficiaryId }, transaction: t });
    if (count <= 1) bad('A beneficiary record must keep at least one impairment');
    const b = await Beneficiary.findByPk(im.beneficiaryId, { transaction: t });
    await im.destroy({ transaction: t });
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Removed impairment ${im.type} from ${b?.code}`, entity: `Impairment:${id}` });
    return { ok: true };
  });
}

// ══════════════════════════════════════════════════════════════
// CORRECTIONS — the beneficiary may see everything and challenge
// it, but the authority to change the official record stays with
// the officer, and every request/decision is recorded.
// ══════════════════════════════════════════════════════════════
export async function requestCorrection(user, text) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  if (!text?.trim()) bad('Please describe what is incorrect');

  const b = await Beneficiary.findByPk(user.beneficiaryId);
  if (!b) notFound('Beneficiary record not found');

  const pending = await Correction.count({ where: { beneficiaryId: b.id, status: 'PENDING' } });
  if (pending >= 5) bad('You already have several correction requests awaiting review');

  const c = await sequelize.transaction(async (t) => {
    const row = await Correction.create({ beneficiaryId: b.id, text: text.trim() }, { transaction: t });
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Correction requested for ${b.code}`, entity: `Correction:${row.id}` });
    return row;
  });

  // Route it to a real officer, by email as well as in-app: a correction
  // that sits unseen in a queue leaves the inaccurate record in force.
  afterCommit(async () => {
    const officer = await officerFor(b);
    if (officer?.email) {
      await sendCorrectionFiled({
        to: officer.email, officerName: officer.fullName,
        beneficiary: b.fullName, code: b.code, text: text.trim(),
      });
    }
  });

  return c;
}

// The beneficiary's own correction history. Showing the outcome is what
// makes the right of correction real: a request that simply disappears is
// indistinguishable, to the person who made it, from one that was ignored.
export async function myCorrections(user) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  return Correction.findAll({ where: { beneficiaryId: user.beneficiaryId }, order: [['createdAt', 'DESC']] });
}

export const listCorrections = (status = 'PENDING') =>
  Correction.findAll({
    where: status && status !== 'all' ? { status } : {},
    include: [{ model: Beneficiary, as: 'beneficiary', attributes: ['id', 'code', 'fullName', 'email', 'sector'] }],
    order: [['createdAt', 'DESC']],
  });

export async function resolveCorrection(officer, id, apply, patch = {}) {
  const outcome = await sequelize.transaction(async (t) => {
    const c = await Correction.findByPk(id, { transaction: t });
    if (!c) notFound('Correction request not found');
    if (c.status !== 'PENDING') bad('This correction was already handled');

    const b = await Beneficiary.findByPk(c.beneficiaryId, { transaction: t });
    if (!b) notFound('Beneficiary not found');

    await c.update({ status: apply ? 'APPLIED' : 'DECLINED', handledById: officer.id }, { transaction: t });

    if (apply) {
      const data = {};
      for (const k of EDITABLE) if (patch[k] !== undefined) data[k] = patch[k];
      if (!Object.keys(data).length) bad('Choose the field to correct and the value it should become');
      const before = Object.fromEntries(Object.keys(data).map((k) => [k, b[k]]));
      await b.update(data, { transaction: t });
      if (data.fullName || data.email) {
        await User.update(
          { ...(data.fullName && { fullName: data.fullName }), ...(data.email && { email: data.email }) },
          { where: { beneficiaryId: b.id }, transaction: t },
        );
      }
      await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Correction ${id} applied to ${b.code}`, entity: `Correction:${id}`, meta: { before, after: data } });
    } else {
      await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Correction ${id} declined for ${b.code}`, entity: `Correction:${id}` });
    }

    await notify(t, c.beneficiaryId, '✏️', apply ? 'Your correction was applied to your record.' : 'Your correction request was reviewed.');
    return { correction: c, email: b.email, text: c.text };
  });

  if (outcome.email) {
    afterCommit(() => sendCorrectionResolved({ to: outcome.email, applied: !!apply, text: outcome.text }));
  }
  return outcome.correction;
}
