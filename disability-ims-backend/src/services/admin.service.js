// ─────────────────────────────────────────────────────────────
// admin.service.js — user & role management (Objective 4 / RBAC).
// The administrator creates and configures staff accounts and can
// deactivate or remove them, without silently altering beneficiary data.
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { sequelize, User, Provider } from '../models/index.js';
import { AppError, audit } from './registry.service.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };

const STAFF_ROLES = ['OFFICER', 'PROVIDER', 'ADMIN'];
const pub = (u) => ({
  id: u.id, fullName: u.fullName, email: u.email, role: u.role, status: u.status,
  sector: u.sector, providerId: u.providerId, beneficiaryId: u.beneficiaryId, language: u.language,
});

export const listProviders = () => Provider.findAll({ attributes: ['id', 'name', 'type'], order: [['name', 'ASC']] });

// ── Create a staff account (officer, provider or admin) ──
export async function createUser(admin, { fullName, email, password, role, sector, providerId }) {
  if (!fullName?.trim() || !email?.trim()) bad('Full name and email are required');
  if (!STAFF_ROLES.includes(role)) bad('Role must be OFFICER, PROVIDER or ADMIN');
  if (!password || password.length < 8) bad('Password must be at least 8 characters');
  if (role === 'PROVIDER' && !providerId) bad('Select a provider organisation for a provider account');

  const existing = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (existing) bad('A user with that email already exists');

  return sequelize.transaction(async (t) => {
    const u = await User.create({
      fullName: fullName.trim(), email: email.trim().toLowerCase(), role,
      sector: role === 'OFFICER' ? (sector || null) : null,
      providerId: role === 'PROVIDER' ? providerId : null,
      passwordHash: await bcrypt.hash(password, 10),
    }, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Created ${role} account ${u.email}`, entity: `User:${u.id}` });
    return pub(u);
  });
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
  if (patch.fullName !== undefined) data.fullName = patch.fullName;
  if (patch.sector !== undefined) data.sector = patch.sector;
  if (patch.role && STAFF_ROLES.includes(patch.role) && u.role !== 'BENEFICIARY') data.role = patch.role;
  if (patch.status && ['ACTIVE', 'INACTIVE'].includes(patch.status)) data.status = patch.status;
  if (!Object.keys(data).length) bad('Nothing to update');

  if (data.status === 'INACTIVE' && u.role === 'ADMIN') {
    const activeAdmins = await User.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) forbid('Cannot deactivate the last active administrator');
  }

  return sequelize.transaction(async (t) => {
    await u.update(data, { transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Updated user ${u.email} (${Object.keys(data).join(', ')})`, entity: `User:${u.id}`, meta: data });
    return pub(u);
  });
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
  return sequelize.transaction(async (t) => {
    const label = `${u.email} (${u.role})`;
    await u.destroy({ transaction: t });
    await audit(t, { actorId: admin.id, actorName: admin.fullName, action: `Deleted user ${label}`, entity: `User:${id}` });
    return { ok: true };
  });
}
