import { z } from 'zod';
import { prisma } from '../models/prisma.js';
import { AppError } from '../utils/errors.js';

const createBillSchema = z.object({
  userId: z.string().min(1),
  workerId: z.string().optional().nullable(),
  billNumber: z.string().min(1).max(50),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amountDue: z.coerce.number().positive(),
  dueDate: z.string().datetime(),
  notes: z.string().max(500).optional().nullable(),
});

const updateBillSchema = z.object({
  workerId: z.string().optional().nullable(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  amountDue: z.coerce.number().positive().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  amountPaid: z.coerce.number().min(0).optional(),
});

function billInclude() {
  return { user: true, worker: { include: { user: true } } };
}

export async function listBills(req, res, next) {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.userId && req.user.role === 'ADMIN') where.userId = String(req.query.userId);

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({ where, include: billInclude(), orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.bill.count({ where }),
    ]);
    res.json({ success: true, data: { bills, pagination: { total, take, skip } } });
  } catch (err) { next(err); }
}

export async function getBill(req, res, next) {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id }, include: billInclude() });
    if (!bill) throw new AppError('Bill not found', 404);
    if (req.user.role !== 'ADMIN' && bill.userId !== req.user.id) throw new AppError('Forbidden', 403);
    res.json({ success: true, data: { bill } });
  } catch (err) { next(err); }
}

export async function createBill(req, res, next) {
  try {
    const data = createBillSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new AppError('User not found', 400, { field: 'userId' });
    if (data.workerId) {
      const worker = await prisma.hksWorker.findUnique({ where: { id: data.workerId } });
      if (!worker) throw new AppError('Worker not found', 400, { field: 'workerId' });
    }

    const bill = await prisma.bill.create({
      data: {
        ...data,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        dueDate: new Date(data.dueDate),
      },
      include: billInclude(),
    });
    res.status(201).json({ success: true, message: 'Bill created', data: { bill } });
  } catch (err) { next(err); }
}

export async function updateBill(req, res, next) {
  try {
    const data = updateBillSchema.parse(req.body);
    const existing = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Bill not found', 404);

    if (data.workerId) {
      const worker = await prisma.hksWorker.findUnique({ where: { id: data.workerId } });
      if (!worker) throw new AppError('Worker not found', 400, { field: 'workerId' });
    }

    const patch = { ...data };
    if (data.periodStart) patch.periodStart = new Date(data.periodStart);
    if (data.periodEnd) patch.periodEnd = new Date(data.periodEnd);
    if (data.dueDate) patch.dueDate = new Date(data.dueDate);

    // Handle payment status transitions
    if (data.status === 'PAID') {
      patch.paidAt = existing.paidAt || new Date();
      if (patch.amountPaid === undefined) patch.amountPaid = Number(existing.amountDue);
    }
    if (data.status === 'PENDING' || data.status === 'OVERDUE' || data.status === 'CANCELLED') {
      if (data.status !== 'PAID') patch.paidAt = null;
    }

    const bill = await prisma.bill.update({ where: { id: req.params.id }, data: patch, include: billInclude() });
    res.json({ success: true, message: 'Bill updated', data: { bill } });
  } catch (err) { next(err); }
}
