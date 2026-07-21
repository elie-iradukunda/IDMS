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
import { sendCredentials } from './notify.js';

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

// Atomic sequential codes: B-1001, R-501
export async function nextCode(t, key, prefix, start) {
  const [c] = await Counter.findOrCreate({ where: { key }, defaults: { value: start }, transaction: t, lock: t.LOCK.UPDATE });
  const value = c.value + 1;
  await c.update({ value }, { transaction: t });
  return `${prefix}-${value}`;
}

// ── Duplicate detection (a registry must be a single record) ──
// Matches on national ID, or on same name within the same sector.
export async function findDuplicates({ nationalId, fullName, sector }) {
  const or = [];
  if (nationalId) or.push({ nationalId });
  if (fullName && sector) or.push({ fullName, sector });
  if (!or.length) return [];
  return Beneficiary.findAll({ where: { [Op.or]: or }, attributes: ['id', 'code', 'fullName', 'sector', 'village'] });
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

  const dups = await findDuplicates({ nationalId, fullName, sector });
  if (dups.length && !allowDuplicate) {
    throw Object.assign(new AppError(409, 'Possible duplicate record found'), { duplicates: dups });
  }

  return sequelize.transaction(async (t) => {
    const code = await nextCode(t, 'beneficiary', 'B', 1000);
    const b = await Beneficiary.create({
      code, fullName: fullName.trim(), nationalId, sector, cell, village, guardianName,
      email: email || null, dailyChallenges, supportNeeds,
      verified: true, consentGiven: true, consentAt: new Date(), registeredById: officer.id,
    }, { transaction: t });

    for (const im of impairments) {
      await Impairment.create({ beneficiaryId: b.id, type: im.type, level: im.level }, { transaction: t });
    }

    // Automatic account creation + credentials issued by email.
    // Where there is no email, guardian/officer-mediated access is the
    // legitimate path — we do not fail the registration.
    let credentials = null;
    if (email) {
      const tempPassword = crypto.randomBytes(6).toString('base64url'); // 8-char temp
      await User.create({
        fullName: b.fullName, email, role: 'BENEFICIARY', beneficiaryId: b.id,
        passwordHash: await bcrypt.hash(tempPassword, 10),
      }, { transaction: t });
      await sendCredentials({ to: email, name: b.fullName, code: b.code, tempPassword });
      credentials = { emailedTo: email };
      await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Credentials emailed for ${b.code}`, entity: `Beneficiary:${b.id}` });
    }

    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Registered beneficiary ${b.code} (${b.fullName})`, entity: `Beneficiary:${b.id}` });
    await notify(t, b.id, '📧', 'Your record was registered and your account created.');
    return { beneficiary: b, credentials, mediatedAccess: !email };
  });
}

// ── Reads ────────────────────────────────────────────────────
const withImpairments = [{ model: Impairment, as: 'impairments' }];

export const listRegistry = ({ q, sector } = {}) =>
  Beneficiary.findAll({
    where: {
      ...(sector && { sector }),
      ...(q && { [Op.or]: [{ fullName: { [Op.like]: `%${q}%` } }, { code: { [Op.like]: `%${q}%` } }] }),
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
export async function updateBeneficiary(officer, id, patch) {
  const allowed = ['sector', 'cell', 'village', 'guardianName', 'email', 'dailyChallenges', 'supportNeeds', 'verified', 'status'];
  const data = {};
  for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k];
  if (!Object.keys(data).length) bad('Nothing to update');

  return sequelize.transaction(async (t) => {
    const b = await Beneficiary.findByPk(id, { transaction: t });
    if (!b) notFound('Beneficiary not found');
    const before = Object.fromEntries(Object.keys(data).map((k) => [k, b[k]]));
    await b.update(data, { transaction: t });
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Updated record ${b.code}`, entity: `Beneficiary:${b.id}`, meta: { before, after: data } });
    return b;
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
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Beneficiary ${b.code} status → ${status}`, entity: `Beneficiary:${b.id}` });
    return b;
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
  return sequelize.transaction(async (t) => {
    const c = await Correction.create({ beneficiaryId: user.beneficiaryId, text: text.trim() }, { transaction: t });
    await audit(t, { actorId: user.id, actorName: user.fullName, action: `Correction requested for beneficiary ${user.beneficiaryId}`, entity: `Correction:${c.id}` });
    return c;
  });
}

export const listCorrections = (status = 'PENDING') =>
  Correction.findAll({ where: { status }, include: [{ model: Beneficiary, as: 'beneficiary', attributes: ['id', 'code', 'fullName'] }], order: [['createdAt', 'DESC']] });

export async function resolveCorrection(officer, id, apply, patch = {}) {
  return sequelize.transaction(async (t) => {
    const c = await Correction.findByPk(id, { transaction: t });
    if (!c) notFound('Correction request not found');
    if (c.status !== 'PENDING') bad('This correction was already handled');

    await c.update({ status: apply ? 'APPLIED' : 'DECLINED', handledById: officer.id }, { transaction: t });
    if (apply && Object.keys(patch).length) {
      const b = await Beneficiary.findByPk(c.beneficiaryId, { transaction: t });
      await b.update(patch, { transaction: t });
    }
    await audit(t, { actorId: officer.id, actorName: officer.fullName, action: `Correction ${id} ${apply ? 'applied' : 'declined'}`, entity: `Correction:${id}`, meta: patch });
    await notify(t, c.beneficiaryId, '✏️', apply ? 'Your correction was applied to your record.' : 'Your correction request was reviewed.');
    return c;
  });
}
