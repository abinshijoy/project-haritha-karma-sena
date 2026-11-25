import { z } from 'zod';
import { prisma } from '../models/prisma.js';
import { AppError } from '../utils/errors.js';

const createWorkerSchema = z.object({
  userId: z.string().min(1),
  employeeCode: z.string().min(1).max(50),
  assignedWard: z.string().max(100).optional().nullable(),
  assignedArea: z.string().max(100).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

const updateWorkerSchema = createWorkerSchema.partial().omit({ userId: true });

export async function listWorkers(req, res, next) {
  try {
    const take = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.assignedWard) where.assignedWard = String(req.query.assignedWard);

    const [workers, total] = await Promise.all([
      prisma.hksWorker.findMany({ where, include: { user: true }, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.hksWorker.count({ where }),
    ]);
    res.json({ success: true, data: { workers, pagination: { total, take, skip } } });
  } catch (err) { next(err); }
}

export async function getWorker(req, res, next) {
  try {
    const worker = await prisma.hksWorker.findUnique({
      where: { id: req.params.id },
      include: { user: true, collectedBills: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
    if (!worker) throw new AppError('Worker not found', 404);
    res.json({ success: true, data: { worker } });
  } catch (err) { next(err); }
}

export async function createWorker(req, res, next) {
  try {
    const data = createWorkerSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new AppError('Linked user not found', 400, { field: 'userId' });

    const worker = await prisma.hksWorker.create({ data, include: { user: true } });
    res.status(201).json({ success: true, message: 'Worker created', data: { worker } });
  } catch (err) { next(err); }
}

export async function updateWorker(req, res, next) {
  try {
    const data = updateWorkerSchema.parse(req.body);
    const worker = await prisma.hksWorker.update({
      where: { id: req.params.id },
      data,
      include: { user: true },
    });
    res.json({ success: true, message: 'Worker updated', data: { worker } });
  } catch (err) { next(err); }
}
