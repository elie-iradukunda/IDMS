import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { AppError } from '../services/registry.service.js';

const SECRET = process.env.JWT_SECRET || 'change-me';

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Authentication required');
    const payload = jwt.verify(token, SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user) throw new AppError(401, 'User no longer exists');
    req.user = user;
    next();
  } catch (e) {
    next(e instanceof AppError ? e : new AppError(401, 'Invalid or expired token'));
  }
}

// Role-based access control (Section 2.1.10): permissions attach to
// roles, not individuals — officers edit, beneficiaries read their own,
// providers search & offer, admins configure.
export const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'You do not have access to this action'));
