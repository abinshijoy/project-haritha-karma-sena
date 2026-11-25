import { z } from 'zod';
import { prisma } from '../models/prisma.js';
import { AppError } from '../utils/errors.js';

const createPointSchema = z.object({
  userId: z.string().min(1),
  billId: z.string().optional().nullable(),
  points: z.number().int().refine((v) => v !== 0, 'Points must not be zero'),
  reason: z.enum(['BILL_PAYMENT', 'WASTE_SEGREGATION', 'SPECIAL_CAMPAIGN', 'ADJUSTMENT']),
  description: z.string().max(500).optional().nullable(),
});

export async function listPoints(req, res, next) {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    if (req.query.userId && req.user.role === 'ADMIN') where.userId = String(req.query.userId);
    if (req.query.reason) where.reason = String(req.query.reason);

    const [entries, count, aggregate] = await Promise.all([
      prisma.pointLedger.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.pointLedger.count({ where }),
      prisma.pointLedger.aggregate({ where, _sum: { points: true } }),
    ]);

    res.json({
      success: true,
      data: {
        entries,
        balance: aggregate._sum.points || 0,
        pagination: { total: count, take, skip },
      },
    });
  } catch (err) { next(err); }
}

export async function getUserPointBalance(req, res, next) {
  try {
    const userId = req.params.userId;
    if (req.user.role !== 'ADMIN' && req.user.id !== userId) throw new AppError('Forbidden', 403);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const aggregate = await prisma.pointLedger.aggregate({ where: { userId }, _sum: { points: true }, _count: true });
    res.json({
      success: true,
      data: {
        userId,
        balance: aggregate._sum.points || 0,
        entries: aggregate._count,
      },
    });
  } catch (err) { next(err); }
}

export async function createPoint(req, res, next) {
  try {
    const data = createPointSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new AppError('User not found', 400, { field: 'userId' });
    if (data.billId) {
      const bill = await prisma.bill.findUnique({ where: { id: data.billId } });
      if (!bill) throw new AppError('Bill not found', 400, { field: 'billId' });
    }

    const entry = await prisma.pointLedger.create({ data });
    res.status(201).json({ success: true, message: 'Point entry created', data: { entry } });
  } catch (err) { next(err); }
}
