import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../models/prisma.js';
import { createOtpChallenge, verifyOtpChallenge, consumeOtpChallenge } from '../services/otpService.js';
import { hashToken } from '../utils/crypto.js';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const requestOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(1).max(100).optional(),
  purpose: z.enum(['LOGIN', 'VERIFY_PHONE']).optional().default('LOGIN'),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(10),
  name: z.string().min(1).max(100).optional(),
  purpose: z.enum(['LOGIN', 'VERIFY_PHONE']).optional().default('LOGIN'),
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    ward: user.ward,
    panchayat: user.panchayat,
    district: user.district,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export async function requestOtp(req, res, next) {
  try {
    const { phone, name, purpose } = requestOtpSchema.parse(req.body);

    let user = await prisma.user.findUnique({ where: { phone } });

    // For LOGIN, create a new resident account if it doesn't exist.
    if (!user && purpose === 'LOGIN') {
      user = await prisma.user.create({
        data: { phone, name: name?.trim() || `User ${phone.slice(-4)}` },
      });
    }

    if (!user && purpose === 'VERIFY_PHONE') {
      throw new AppError('No user found for this phone number', 404);
    }

    const result = await createOtpChallenge({ phone, userId: user?.id || null, purpose });
    res.status(201).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        ...(config.otpProvider === 'console' ? { devNote: 'OTP is printed in the backend terminal (development mode).' } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { phone, code, name, purpose } = verifyOtpSchema.parse(req.body);
    const challenge = await verifyOtpChallenge({ phone, code, purpose });

    let user = challenge.userId
      ? await prisma.user.findUnique({ where: { id: challenge.userId } })
      : await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      if (purpose !== 'LOGIN') throw new AppError('User not found', 404);
      user = await prisma.user.create({
        data: { phone, name: name?.trim() || `User ${phone.slice(-4)}` },
      });
    }

    if (!user.isActive) throw new AppError('User account is disabled', 403);

    if (name?.trim() && (!user.name || user.name.startsWith('User '))) {
      user = await prisma.user.update({ where: { id: user.id }, data: { name: name.trim() } });
    }

    await consumeOtpChallenge(challenge.id);

    const token = signToken(user);
    const tokenHash = hashToken(token);
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent: req.headers['user-agent']?.slice(0, 255),
        ipAddress: req.ip,
      },
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        tokenType: 'Bearer',
        expiresAt,
        user: safeUser(user),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({ success: true, data: { user: safeUser(req.user) } });
}

export async function logout(req, res, next) {
  try {
    if (req.authSession?.id) {
      await prisma.authSession.update({
        where: { id: req.authSession.id },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}
