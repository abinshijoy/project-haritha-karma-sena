import { z } from 'zod';
import { prisma } from '../models/prisma.js';
import { AppError } from '../utils/errors.js';

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().nullable(),
  role: z.enum(['RESIDENT', 'ADMIN']).optional(),
  ward: z.string().max(100).optional().nullable(),
  panchayat: z.string().max(100).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
});

const updateUserSchema = createUserSchema.partial().extend({
  isActive: z.boolean().optional(),
});

function safeUser(user) {
  if (!user) return user;
  const { ...rest } = user;
  return rest;
}

export async function listUsers(req, res, next) {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const role = req.query.role;
    const where = {};
    if (role === 'RESIDENT' || role === 'ADMIN') where.role = role;
    if (req.query.ward) where.ward = String(req.query.ward);
    if (req.query.isActive === 'true') where.isActive = true;
    if (req.query.isActive === 'false') where.isActive = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: { users: users.map(safeUser), pagination: { total, take, skip } } });
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await prisma.user.create({ data });
    res.status(201).json({ success: true, message: 'User created', data: { user: safeUser(user) } });
  } catch (err) { next(err); }
}

export async function getUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        workerProfile: true,
        bills: { take: 20, orderBy: { createdAt: 'desc' } },
        pointLedger: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, data: { user: safeUser(user) } });
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    const data = updateUserSchema.parse(req.body);
    // Non-admins cannot change role or isActive
    if (req.user.role !== 'ADMIN') {
      delete data.role;
      delete data.isActive;
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ success: true, message: 'User updated', data: { user: safeUser(user) } });
  } catch (err) { next(err); }
}
