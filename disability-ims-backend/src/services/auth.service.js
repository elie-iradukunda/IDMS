// ─────────────────────────────────────────────────────────────
// auth.service.js — bcrypt + JWT, and a real password reset.
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { AppError } from './registry.service.js';
import { sendResetToken } from './notify.js';

const SECRET = process.env.JWT_SECRET || 'change-me';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sign = (u) => jwt.sign({ sub: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, sector: u.sector, beneficiaryId: u.beneficiaryId, providerId: u.providerId, language: u.language });

export async function login({ email, password }) {
  const user = await User.findOne({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  if (user.status === 'INACTIVE') throw new AppError(403, 'This account has been deactivated. Contact an administrator.');
  return { token: sign(user), user: pub(user) };
}

// Beneficiaries receive a temporary password by email at registration
// and should change it on first use.
export async function changePassword(user, { currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 8) throw new AppError(400, 'New password must be at least 8 characters');
  const fresh = await User.findByPk(user.id);
  if (!(await bcrypt.compare(currentPassword || '', fresh.passwordHash))) throw new AppError(401, 'Current password is incorrect');
  await fresh.update({ passwordHash: await bcrypt.hash(newPassword, 10) });
  return { ok: true };
}

export async function forgotPassword({ email }) {
  const user = await User.findOne({ where: { email } });
  if (!user) return { ok: true }; // don't reveal which emails exist
  const raw = crypto.randomBytes(32).toString('hex');
  await user.update({ resetTokenHash: sha256(raw), resetTokenExpiry: new Date(Date.now() + 3600e3) });
  await sendResetToken({ to: email, token: raw });
  return { ok: true, devResetToken: process.env.NODE_ENV === 'development' ? raw : undefined };
}

export async function resetPassword({ token, password }) {
  if (!token || !password) throw new AppError(400, 'Token and new password are required');
  const user = await User.findOne({ where: { resetTokenHash: sha256(token) } });
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) throw new AppError(400, 'Invalid or expired reset token');
  await user.update({ passwordHash: await bcrypt.hash(password, 10), resetTokenHash: null, resetTokenExpiry: null });
  return { ok: true };
}

export async function setLanguage(user, language) {
  if (!['rw', 'en'].includes(language)) throw new AppError(400, 'Language must be rw or en');
  await User.update({ language }, { where: { id: user.id } });
  return { ok: true, language };
}
