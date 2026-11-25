import { prisma } from '../models/prisma.js';
import { generateOtp, hashValue, verifyHash } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';

export async function createOtpChallenge({ phone, userId = null, purpose = 'LOGIN' }) {
  // Cooldown: prevent OTP spam
  const cooldownSince = new Date(Date.now() - config.otpRequestCooldownSeconds * 1000);
  const recent = await prisma.otpChallenge.findFirst({
    where: { phone, purpose, createdAt: { gt: cooldownSince } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const waitSec = Math.ceil((recent.createdAt.getTime() + config.otpRequestCooldownSeconds * 1000 - Date.now()) / 1000);
    throw new AppError(`Please wait ${waitSec}s before requesting another OTP`, 429, { retryAfterSeconds: waitSec });
  }

  const otp = generateOtp(config.otpLength);
  const codeHash = await hashValue(otp);
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);

  const challenge = await prisma.otpChallenge.create({
    data: {
      phone,
      userId,
      purpose,
      codeHash,
      expiresAt,
      status: 'PENDING',
      maxAttempts: config.otpMaxAttempts,
    },
  });

  // Development provider: log OTP to terminal. Replace with real SMS/email provider for production.
  if (config.otpProvider === 'console') {
    console.log(`[OTP][DEV] phone=${phone} purpose=${purpose} code=${otp} expiresAt=${expiresAt.toISOString()}`);
  }

  return { challengeId: challenge.id, expiresAt };
}

export async function verifyOtpChallenge({ phone, code, purpose = 'LOGIN' }) {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, purpose, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) throw new AppError('No active OTP challenge found. Request a new OTP.', 400);

  if (challenge.expiresAt < new Date()) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: 'EXPIRED' } });
    throw new AppError('OTP expired. Request a new OTP.', 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError('OTP attempt limit exceeded. Request a new OTP.', 429);
  }

  const ok = await verifyHash(code, challenge.codeHash);
  if (!ok) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('Invalid OTP', 400);
  }

  const verified = await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { status: 'VERIFIED', verifiedAt: new Date() },
  });

  return verified;
}

export async function consumeOtpChallenge(id) {
  await prisma.otpChallenge.update({
    where: { id },
    data: { status: 'CONSUMED', consumedAt: new Date() },
  });
}
