import jwt from 'jsonwebtoken';
import { prisma } from '../models/prisma.js';
import { hashToken } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Missing bearer token', 401);

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const tokenHash = hashToken(token);
    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) throw new AppError('Session not found or revoked', 401);
    if (session.revokedAt) throw new AppError('Session has been revoked', 401);
    if (session.expiresAt < new Date()) throw new AppError('Session expired', 401);
    if (!session.user || !session.user.isActive) throw new AppError('User account is inactive', 401);
    if (payload.sub !== session.userId) throw new AppError('Invalid token subject', 401);

    req.user = session.user;
    req.authSession = session;
    req.authToken = token;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError('Unauthorized', 401, process.env.NODE_ENV !== 'production' ? err.message : undefined));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('Forbidden: insufficient role', 403));
    next();
  };
}

export function requireSelfOrAdmin(paramName = 'id') {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    if (req.user.role === 'ADMIN' || req.user.id === req.params[paramName]) return next();
    return next(new AppError('Forbidden: you can only access your own data', 403));
  };
}
