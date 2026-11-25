import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_SECRET'];

export function validateEnv() {
  const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET === 'replace-with-a-long-random-secret-at-least-32-chars') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be changed from the example value in production.');
    }
    console.warn('[WARN] JWT_SECRET is using the example value. Change it before real deployment.');
  }

  if (String(process.env.JWT_SECRET).length < 16) {
    console.warn('[WARN] JWT_SECRET is short. Use at least 32 random characters.');
  }

  const numeric = {
    PORT: process.env.PORT || 3000,
    OTP_TTL_MINUTES: process.env.OTP_TTL_MINUTES || 10,
    OTP_LENGTH: process.env.OTP_LENGTH || 6,
    OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS || 5,
    OTP_REQUEST_COOLDOWN_SECONDS: process.env.OTP_REQUEST_COOLDOWN_SECONDS || 60,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || 100,
    AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX || 20,
  };
  for (const [key, raw] of Object.entries(numeric)) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${key} must be a positive number (received ${raw}).`);
    }
  }

  const provider = process.env.OTP_PROVIDER || 'console';
  if (provider !== 'console') {
    throw new Error(
      `OTP_PROVIDER "${provider}" is not implemented. Use "console" for this build or add a delivery provider.`
    );
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  otpLength: Number(process.env.OTP_LENGTH || 6),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  otpRequestCooldownSeconds: Number(process.env.OTP_REQUEST_COOLDOWN_SECONDS || 60),
  otpProvider: process.env.OTP_PROVIDER || 'console',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
};
