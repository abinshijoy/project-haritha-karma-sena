import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i += 1) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

export async function hashValue(value) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

export async function verifyHash(value, hash) {
  return bcrypt.compare(value, hash);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
