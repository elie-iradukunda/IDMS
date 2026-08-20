// ─────────────────────────────────────────────────────────────
// admin.service.js — user, role and provider-organisation management
// (Objective 4 / RBAC). The administrator creates and configures staff
// accounts and the organisations they belong to, and can deactivate or
// remove them, without silently altering beneficiary data.
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fn, col } from 'sequelize';
import { sequelize, User, Provider, SupportRequest } from '../models/index.js';
import { AppError, audit, afterCommit } from './registry.service.js';
import { sendStaffAccount, sendAccountDeactivated, sendUserInvitation } from './notify.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const ALL_ROLES = ['OFFICER', 'PROVIDER', 'ADMIN', 'BENEFICIARY'];
const pub = (u) => ({
  id: u.id, fullName: u.fullName, email: u.email, role: u.role, status: u.status,
  sector: u.sector, providerId: u.providerId, beneficiaryId: u.beneficiaryId, language: u.language,
});

// ══════════════════════════════════════════════════════════════
// PROVIDER ORGANISATIONS
// A provider account cannot exist without an organisation to belong to,
// so the administrator has to be able to create one. Counts are included
// because the useful question about an organisation is what it has
// actually done, not that it exists.
// ══════════════════════════════════════════════════════════════
export async function listProviders() {
  const [rows, counts] = await Promise.all([
    Provider.findAll({ order: [['name', 'ASC']] }),
    SupportRequest.findAll({ attributes: ['providerId', [fn('COUNT', col('id')), 'n']], group: ['providerId'], raw: true }),
  ]);
  const users = await User.findAll({ attributes: ['providerId'], where: { role: 'PROVIDER' }, raw: true });
  const offers = Object.fromEntries(counts.filter((c) => c.providerId).map((c) => [c.providerId, Number(c.n)]));
  const accounts = users.reduce((m, u) => ({ ...m, [u.providerId]: (m[u.providerId] || 0) + 1 }), {});
  return rows.map((p) => ({
    id: p.id, name: p.name, type: p.type, contact: p.contact, createdAt: p.createdAt,
    offers: offers[p.id] || 0, accounts: accounts[p.id] || 0,
  }));
}

export async function createProvider(admin, { name, type, contact }) {
  if (!name?.trim()) bad('An organisation name is required');
  const existing = await Provider.findOne({ where: { name: name.trim() } });
  if (existing) bad('An organisation with that name already exists');
  return sequelize.transaction(async (t) => {
    const p = await Provider.create({ name: name.trim(), type: type?.trim() || null, contact: contact?.trim() || null }, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Created provider organisation ${p.name}`, entity: `Provider:${p.id}` });
    return p;
  });
}

export async function updateProvider(admin, id, { name, type, contact }) {
  const p = await Provider.findByPk(id);
  if (!p) notFound('Provider organisation not found');
  const data = {};
  if (name !== undefined) { if (!name.trim()) bad('An organisation name is required'); data.name = name.trim(); }
  if (type !== undefined) data.type = type?.trim() || null;
  if (contact !== undefined) data.contact = contact?.trim() || null;
  if (!Object.keys(data).length) bad('Nothing to update');
  return sequelize.transaction(async (t) => {
    await p.update(data, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Updated provider organisation ${p.name}`, entity: `Provider:${p.id}`, meta: data });
    return p;
  });
}

// Deleting an organisation that has accounts or support history would
// orphan both, so it is refused with the reason rather than cascaded.
export async function deleteProvider(admin, id) {
  const p = await Provider.findByPk(id);
  if (!p) notFound('Provider organisation not found');
  const [accounts, requests] = await Promise.all([
    User.count({ where: { providerId: id } }),
    SupportRequest.count({ where: { providerId: id } }),
  ]);
  if (accounts) forbid(`${accounts} user account(s) still belong to this organisation — reassign or delete them first`);
  if (requests) forbid(`This organisation has ${requests} support request(s) in the record and cannot be deleted`);
  return sequelize.transaction(async (t) => {
    const label = p.name;
    await p.destroy({ transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Deleted provider organisation ${label}`, entity: `Provider:${id}` });
    return { ok: true };
  });
}

// ══════════════════════════════════════════════════════════════
// USER ACCOUNTS & INVITATIONS
// ══════════════════════════════════════════════════════════════
export async function createUser(admin, { fullName, email, password, role, sector, providerId, beneficiaryId, inviteViaEmail = true }) {
  if (!fullName?.trim() || !email?.trim()) bad('Full name and email are required');
  if (!ALL_ROLES.includes(role)) bad('Role must be OFFICER, PROVIDER, ADMIN or BENEFICIARY');
  if (role === 'PROVIDER' && !providerId) bad('Select a provider organisation for a provider account');

  const normalised = email.trim().toLowerCase();
  const existing = await User.findOne({ where: { email: normalised } });
  if (existing) bad('A user with that email already exists');

  if (role === 'PROVIDER') {
    const org = await Provider.findByPk(providerId);
    if (!org) bad('That provider organisation does not exist');
  }

  let tempPassword = null;
  let rawToken = null;
  let passwordHash = null;
  let resetTokenHash = null;
  let resetTokenExpiry = null;

  if (inviteViaEmail) {
    // Generate secure invitation token for password setup / reset
    rawToken = crypto.randomBytes(32).toString('hex');
    resetTokenHash = sha256(rawToken);
    resetTokenExpiry = new Date(Date.now() + 7 * 24 * 3600e3); // 7 days
    const randomInitial = crypto.randomBytes(16).toString('base64url');
    passwordHash = await bcrypt.hash(randomInitial, 10);
  } else {
    // Administrator sets password or system generates temporary password
    const generated = !password;
    tempPassword = password || crypto.randomBytes(6).toString('base64url');
    if (!generated && password.length < 8) bad('Password must be at least 8 characters');
    passwordHash = await bcrypt.hash(tempPassword, 10);
  }

  const created = await sequelize.transaction(async (t) => {
    const u = await User.create({
      fullName: fullName.trim(),
      email: normalised,
      role,
      sector: role === 'OFFICER' ? (sector || null) : null,
      providerId: role === 'PROVIDER' ? providerId : null,
      beneficiaryId: role === 'BENEFICIARY' ? (beneficiaryId || null) : null,
      passwordHash,
      resetTokenHash,
      resetTokenExpiry,
    }, { transaction: t });
    await audit(t, {
      actorId: admin.id,
      actorName: admin.fullName,
      action: inviteViaEmail
        ? `Created and invited ${role} account ${u.email} via email`
        : `Created ${role} account ${u.email}`,
      entity: `User:${u.id}`,
    });
    return u;
  });

  if (inviteViaEmail) {
    afterCommit(() => sendUserInvitation({
      to: normalised,
      name: created.fullName,
      role,
      token: rawToken,
      invitedBy: admin.fullName,
    }));
  } else {
    afterCommit(() => sendStaffAccount({
      to: normalised,
      name: created.fullName,
      role,
      tempPassword,
    }));
  }

  return {
    ...pub(created),
    credentials: {
      emailedTo: normalised,
      invited: inviteViaEmail,
      generated: !inviteViaEmail && !password,
      devResetToken: process.env.NODE_ENV === 'development' ? rawToken : undefined,
    },
  };
}

// ── Invite an existing user via email (send password reset / activation link) ──
export async function inviteUser(admin, id) {
  const u = await User.findByPk(id);
  if (!u) notFound('User not found');
  if (u.status === 'INACTIVE') bad('Cannot invite a deactivated account. Reactivate the account first.');

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 3600e3); // 7 days

  await sequelize.transaction(async (t) => {
    await u.update({
      resetTokenHash: tokenHash,
      resetTokenExpiry: tokenExpiry,
    }, { transaction: t });
    await audit(t, {
      actorId: admin.id,
      actorName: admin.fullName,
      action: `Sent email invitation/reset link to ${u.email}`,
      entity: `User:${u.id}`,
    });
  });

  afterCommit(() => sendUserInvitation({
    to: u.email,
    name: u.fullName,
    role: u.role,
    token: rawToken,
    invitedBy: admin.fullName,
  }));

  return {
    ok: true,
    emailedTo: u.email,
    devResetToken: process.env.NODE_ENV === 'development' ? rawToken : undefined,
  };
}

// ── Update role, status or profile of a user ──
export async function updateUser(admin, id, patch) {
  const u = await User.findByPk(id);
  if (!u) notFound('User not found');
  // Guard against an admin locking themselves out.
  if (u.id === admin.id) {
    if (patch.status === 'INACTIVE') forbid('You cannot deactivate your own account');
    if (patch.role && patch.role !== 'ADMIN') forbid('You cannot change your own role');
  }
  const data = {};
  if (patch.fullName !== undefined) { if (!patch.fullName.trim()) bad('Full name cannot be empty'); data.fullName = patch.fullName.trim(); }
  if (patch.email !== undefined && patch.email.trim().toLowerCase() !== u.email) {
    const normalised = patch.email.trim().toLowerCase();
    if (!normalised) bad('Email cannot be empty');
    const clash = await User.findOne({ where: { email: normalised } });
    if (clash) bad('Another account already uses that email');
    data.email = normalised;
  }
  if (patch.sector !== undefined) data.sector = patch.sector || null;
  if (patch.providerId !== undefined && (patch.role === 'PROVIDER' || u.role === 'PROVIDER')) {
    if (patch.providerId && !(await Provider.findByPk(patch.providerId))) bad('That provider organisation does not exist');
    data.providerId = patch.providerId || null;
  }
  if (patch.beneficiaryId !== undefined) {
    data.beneficiaryId = patch.beneficiaryId || null;
  }
  if (patch.role && ALL_ROLES.includes(patch.role)) {
    if (patch.role === 'PROVIDER' && !(patch.providerId || u.providerId)) bad('A provider account needs a provider organisation');
    data.role = patch.role;
    if (patch.role !== 'OFFICER') data.sector = null;
    if (patch.role !== 'PROVIDER') data.providerId = null;
    if (patch.role !== 'BENEFICIARY') data.beneficiaryId = null;
  }
  if (patch.status && ['ACTIVE', 'INACTIVE'].includes(patch.status)) data.status = patch.status;
  if (!Object.keys(data).length) bad('Nothing to update');

  if (data.status === 'INACTIVE' && u.role === 'ADMIN') {
    const activeAdmins = await User.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) forbid('Cannot deactivate the last active administrator');
  }

  const updated = await sequelize.transaction(async (t) => {
    await u.update(data, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Updated user ${u.email} (${Object.keys(data).join(', ')})`, entity: `User:${u.id}`, meta: data });
    return u;
  });

  // Losing access without being told is how people conclude a system is arbitrary.
  if (data.status === 'INACTIVE') {
    afterCommit(() => sendAccountDeactivated({ to: updated.email, name: updated.fullName }));
  }
  return pub(updated);
}

// ── Reset a user's password (administrator-issued) ──
export async function resetUserPassword(admin, id) {
  const u = await User.findByPk(id);
  if (!u) notFound('User not found');
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  await sequelize.transaction(async (t) => {
    await u.update({ passwordHash: await bcrypt.hash(tempPassword, 10), resetTokenHash: null, resetTokenExpiry: null }, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Reset password for ${u.email}`, entity: `User:${u.id}` });
  });
  afterCommit(() => sendStaffAccount({ to: u.email, name: u.fullName, role: u.role, tempPassword }));
  return { ok: true, emailedTo: u.email };
}

// ── Delete a user (hard delete; guarded) ──
export async function deleteUser(admin, id) {
  const u = await User.findByPk(id);
  if (!u) notFound('User not found');
  if (u.id === admin.id) forbid('You cannot delete your own account');
  if (u.role === 'ADMIN') {
    const admins = await User.count({ where: { role: 'ADMIN' } });
    if (admins <= 1) forbid('Cannot delete the last administrator');
  }
  // Deleting the login of a beneficiary linked to a registry record would leave
  // that record without an owner; deactivating preserves the record and its history.
  if (u.role === 'BENEFICIARY' && u.beneficiaryId) {
    forbid('A beneficiary login linked to a registry record cannot be deleted here — archive the beneficiary record in the registry instead, or deactivate the account');
  }
  return sequelize.transaction(async (t) => {
    const label = `${u.email} (${u.role})`;
    await u.destroy({ transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Deleted user ${label}`, entity: `User:${id}` });
    return { ok: true };
  });
}
