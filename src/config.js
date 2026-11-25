require('dotenv').config();

const port = Number(process.env.PORT || 8000);

module.exports = {
  port,
  appUrl: process.env.APP_URL || `http://localhost:${port}`,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hks_billing',
  adminToken: process.env.ADMIN_TOKEN || 'change-this-admin-token',
  monthlyFeePaise: Number(process.env.MONTHLY_FEE_PAISE || 5000),
  currency: process.env.CURRENCY || 'INR',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret:
    process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
  upiId: process.env.UPI_ID || 'harithakarmasena@upi',
  upiName: process.env.UPI_NAME || 'Haritha Karma Sena',
  razorpayConfigured: Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ),
  pgSsl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined
};
