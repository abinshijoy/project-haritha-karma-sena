const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const config = require('./config');
const { query } = require('./db');
const lib = require('./lib');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== config.adminToken) {
    return res.status(401).json({ error: 'Admin token is required.' });
  }
  req.admin = req.headers['x-admin-user'] || 'admin';
  next();
}

function publicConfig() {
  return {
    appUrl: config.appUrl,
    monthlyFeePaise: config.monthlyFeePaise,
    currency: config.currency,
    razorpayConfigured: config.razorpayConfigured,
    razorpayKeyId: config.razorpayKeyId,
    upiId: config.upiId,
    upiName: config.upiName
  };
}

function receiptUrl(paymentId) {
  return `/receipt.html?id=${encodeURIComponent(paymentId)}`;
}

// ---------------------------------------------------------------------------
// Razorpay webhook — must be registered before express.json() to keep the raw
// body intact for HMAC verification.
// ---------------------------------------------------------------------------
app.post(
  '/api/webhooks/razorpay',
  express.raw({ type: '*/*' }),
  asyncRoute(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!config.razorpayWebhookSecret || !signature) {
      throw lib.httpError(400, 'Webhook secret or signature is missing.');
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const expected = lib.hmacSha256(config.razorpayWebhookSecret, raw);
    if (!lib.signaturesMatch(signature, expected)) {
      throw lib.httpError(400, 'Invalid webhook signature.');
    }

    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw lib.httpError(400, 'Webhook body is not valid JSON.');
    }

    const eventId = event.id || crypto.randomUUID();
    const recorded = await query(
      `INSERT INTO webhook_events (event_id, payload)
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId, JSON.stringify(event)]
    );
    if (!recorded.rowCount) {
      return res.json({ received: true, duplicate: true });
    }

    const entity =
      event.payload?.payment?.entity ||
      event.payload?.order?.entity ||
      null;
    const paymentId = entity?.id || null;
    const orderId = entity?.order_id || entity?.id || null;

    if (!entity) return res.json({ received: true, ignored: event.event });

    let match = null;
    if (paymentId) {
      match = await query(
        'SELECT id, status FROM payments WHERE razorpay_payment_id = $1 LIMIT 1',
        [paymentId]
      );
    }
    if (!match?.rowCount && orderId) {
      match = await query(
        'SELECT id, status FROM payments WHERE razorpay_order_id = $1 LIMIT 1',
        [orderId]
      );
    }

    if (match?.rowCount) {
      const existing = match.rows[0];
      if (event.event === 'payment.captured' || event.event === 'order.paid') {
        if (existing.status !== 'paid') {
          const paid = await lib.markPaymentPaid(existing.id, {
            razorpayPaymentId: paymentId,
            verifiedBy: 'razorpay-webhook'
          });
          return res.json({ received: true, paid: true, receiptNo: paid.receipt_no });
        }
      } else if (event.event === 'payment.failed') {
        await lib.updatePaymentStatus(existing.id, 'failed', {
          reason: entity.error_description || entity.error_code || 'Payment failed'
        });
        return res.json({ received: true, failed: true });
      }
    }

    res.json({ received: true, ignored: event.event });
  })
);

app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Public metadata
// ---------------------------------------------------------------------------
app.get('/api/health', asyncRoute(async (req, res) => {
  let db = 'ok';
  try {
    await query('SELECT 1');
  } catch (err) {
    db = `unavailable: ${err.message || err.code || 'unknown error'}`;
  }
  res.json({
    ok: db === 'ok',
    db,
    razorpayConfigured: config.razorpayConfigured,
    upiId: config.upiId,
    monthlyFeePaise: config.monthlyFeePaise,
    currency: config.currency,
    serverTime: new Date().toISOString()
  });
}));

app.get('/api/config', (req, res) => res.json(publicConfig()));

async function lookupHistory(req, res) {
  const phone = String(req.query.phone || '').trim();
  const email = String(req.query.email || '').trim();
  if (!phone && !email) throw lib.httpError(400, 'Provide a phone number or email address.');

  const memberResult = await query(
    `SELECT id, full_name, phone, email, ward, created_at
     FROM members
     WHERE phone = $1 OR ($2 <> '' AND lower(email) = lower($2))
     LIMIT 1`,
    [phone, email]
  );
  if (!memberResult.rowCount) throw lib.httpError(404, 'No member found for those details.');

  const member = memberResult.rows[0];
  const invoiceResult = await query(
    `SELECT id, invoice_no, billing_month, amount_paise, due_date, status, created_at
     FROM invoices WHERE member_id = $1 ORDER BY billing_month DESC, invoice_no DESC`,
    [member.id]
  );
  const invoiceIds = invoiceResult.rows.map((row) => row.id);
  let paymentRows = [];
  if (invoiceIds.length) {
    const paymentResult = await query(
      `SELECT id, invoice_id, amount_paise, method, status, paid_at, receipt_no,
              upi_ref, razorpay_payment_id, collected_by, failure_reason, created_at
       FROM payments WHERE invoice_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
      [invoiceIds]
    );
    paymentRows = paymentResult.rows;
  }

  const invoices = invoiceResult.rows.map((invoice) => ({
    ...invoice,
    monthLabel: lib.monthLabel(invoice.billing_month),
    formattedAmount: lib.formatRupees(invoice.amount_paise),
    payments: paymentRows.filter((payment) => payment.invoice_id === invoice.id)
  }));

  const allPayments = invoices.flatMap((invoice) => invoice.payments);
  const paidPayments = allPayments.filter((payment) => payment.status === 'paid');

  res.json({
    member,
    invoices,
    summary: {
      totalPaidPaise: paidPayments.reduce((sum, payment) => sum + Number(payment.amount_paise), 0),
      paidCount: paidPayments.length,
      pendingCount: invoices.filter(
        (invoice) => invoice.status !== 'paid' &&
          !invoice.payments.some((payment) => payment.status === 'paid')
      ).length,
      invoiceCount: invoices.length
    }
  });
}

app.get('/api/members/lookup', asyncRoute(lookupHistory));
app.get('/api/history', asyncRoute(lookupHistory));

// ---------------------------------------------------------------------------
// Razorpay checkout
// ---------------------------------------------------------------------------
app.post('/api/payments/razorpay/order', asyncRoute(async (req, res) => {
  if (!config.razorpayConfigured) {
    throw lib.httpError(503, 'Razorpay is not configured. Use UPI or cash payment instead.');
  }

  const invoice = await lib.findInvoice({
    invoiceId: req.body?.invoiceId,
    phone: req.body?.phone
  });
  if (!invoice) throw lib.httpError(404, 'No unpaid invoice found for this member.');
  if (invoice.status === 'paid') throw lib.httpError(409, 'This invoice is already paid.');

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Number(invoice.amount_paise),
      currency: config.currency,
      receipt: invoice.invoice_no.slice(0, 40),
      notes: {
        invoice_no: invoice.invoice_no,
        member_phone: invoice.phone,
        billing_month: String(invoice.billing_month).slice(0, 10)
      }
    })
  });
  const order = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw lib.httpError(502, order?.error?.description || 'Razorpay could not create an order.');
  }

  const payment = await lib.createPayment({
    invoice,
    method: 'razorpay',
    fields: { status: 'pending', razorpayOrderId: order.id }
  });

  res.json({
    keyId: config.razorpayKeyId,
    orderId: order.id,
    amount: Number(invoice.amount_paise),
    currency: config.currency,
    paymentId: payment.id,
    invoiceNo: invoice.invoice_no,
    monthLabel: lib.monthLabel(invoice.billing_month),
    memberName: invoice.full_name,
    phone: invoice.phone,
    email: invoice.email
  });
}));

app.post('/api/payments/razorpay/verify', asyncRoute(async (req, res) => {
  if (!config.razorpayKeySecret) {
    throw lib.httpError(503, 'Razorpay is not configured on this server.');
  }
  const { orderId, paymentId, signature } = req.body || {};
  if (!orderId || !paymentId || !signature) {
    throw lib.httpError(400, 'orderId, paymentId and signature are required.');
  }

  const expected = lib.hmacSha256(config.razorpayKeySecret, `${orderId}|${paymentId}`);
  if (!lib.signaturesMatch(signature, expected)) {
    throw lib.httpError(400, 'Payment signature verification failed.');
  }

  const existing = await query(
    'SELECT * FROM payments WHERE razorpay_order_id = $1 LIMIT 1',
    [orderId]
  );
  if (!existing.rowCount) throw lib.httpError(404, 'Razorpay order was not found.');

  const payment = existing.rows[0];
  if (payment.status === 'paid') {
    return res.json({
      ok: true,
      alreadyPaid: true,
      receiptNo: payment.receipt_no,
      receiptUrl: receiptUrl(payment.id)
    });
  }

  const paid = await lib.markPaymentPaid(payment.id, {
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    verifiedBy: 'razorpay-checkout'
  });
  res.json({
    ok: true,
    receiptNo: paid.receipt_no,
    receiptUrl: receiptUrl(paid.id)
  });
}));

app.post('/api/payments/razorpay/fail', asyncRoute(async (req, res) => {
  const { orderId, reason } = req.body || {};
  if (!orderId) throw lib.httpError(400, 'orderId is required.');
  const existing = await query(
    'SELECT * FROM payments WHERE razorpay_order_id = $1 LIMIT 1',
    [orderId]
  );
  if (!existing.rowCount) throw lib.httpError(404, 'Razorpay order was not found.');
  const updated = await lib.updatePaymentStatus(existing.rows[0].id, 'failed', {
    reason: reason || 'Checkout was not completed'
  });
  res.json({ ok: true, status: updated.status });
}));

// ---------------------------------------------------------------------------
// Manual UPI
// ---------------------------------------------------------------------------
app.post('/api/payments/upi', asyncRoute(async (req, res) => {
  const upiRef = String(req.body?.upiRef || '').trim();
  if (!upiRef) throw lib.httpError(400, 'UPI transaction reference / UTR is required.');

  const invoice = await lib.findInvoice({
    invoiceId: req.body?.invoiceId,
    phone: req.body?.phone
  });
  if (!invoice) throw lib.httpError(404, 'No unpaid invoice found for this member.');
  if (invoice.status === 'paid') throw lib.httpError(409, 'This invoice is already paid.');

  const payment = await lib.createPayment({
    invoice,
    method: 'upi',
    fields: { status: 'pending', upiRef }
  });

  res.json({
    ok: true,
    paymentId: payment.id,
    status: 'pending',
    message: 'Payment submitted. An admin will verify the UPI reference and issue the receipt.',
    upiLink: lib.upiLink(invoice)
  });
}));

app.get('/api/payments/upi/qr', asyncRoute(async (req, res) => {
  const invoice = await lib.findInvoice({ invoiceId: req.query.invoiceId });
  if (!invoice) throw lib.httpError(404, 'Invoice not found.');

  const png = await QRCode.toBuffer(lib.upiLink(invoice), {
    type: 'png',
    width: 360,
    margin: 1,
    color: { dark: '#071e17ff', light: '#ffffffff' }
  });
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(png);
}));

// ---------------------------------------------------------------------------
// Cash (admin only)
// ---------------------------------------------------------------------------
app.post('/api/payments/cash', requireAdmin, asyncRoute(async (req, res) => {
  const collectedBy = String(req.body?.collectedBy || '').trim();
  if (!collectedBy) throw lib.httpError(400, 'collectedBy is required for cash payments.');

  const invoice = await lib.findInvoice({
    invoiceId: req.body?.invoiceId,
    phone: req.body?.phone
  });
  if (!invoice) throw lib.httpError(404, 'No unpaid invoice found for this member.');
  if (invoice.status === 'paid') throw lib.httpError(409, 'This invoice is already paid.');

  const pending = await lib.createPayment({
    invoice,
    method: 'cash',
    fields: {
      status: 'pending',
      collectedBy,
      reference: req.body?.reference ? String(req.body.reference).trim() : null
    }
  });
  const paid = await lib.markPaymentPaid(pending.id, {
    collectedBy,
    verifiedBy: req.admin
  });
  res.json({
    ok: true,
    receiptNo: paid.receipt_no,
    receiptUrl: receiptUrl(paid.id)
  });
}));

// ---------------------------------------------------------------------------
// Digital receipts
// ---------------------------------------------------------------------------
app.get('/api/receipts/:paymentId', asyncRoute(async (req, res) => {
  const receipt = await lib.getReceipt(req.params.paymentId);
  if (!receipt) throw lib.httpError(404, 'Receipt is available only for completed payments.');

  res.json({
    ...receipt,
    formattedAmount: lib.formatRupees(receipt.amount_paise),
    amountWords: lib.amountInWords(receipt.amount_paise),
    monthLabel: lib.monthLabel(receipt.billing_month),
    verificationUrl: `${config.appUrl}${receiptUrl(receipt.id)}`
  });
}));

app.get('/api/receipts/:paymentId/qr', asyncRoute(async (req, res) => {
  const receipt = await lib.getReceipt(req.params.paymentId);
  if (!receipt) throw lib.httpError(404, 'Receipt not found.');
  const png = await QRCode.toBuffer(`${config.appUrl}${receiptUrl(receipt.id)}`, {
    type: 'png',
    width: 260,
    margin: 1,
    color: { dark: '#071e17ff', light: '#ffffffff' }
  });
  res.set('Content-Type', 'image/png');
  res.send(png);
}));

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------
app.get('/api/admin/overview', requireAdmin, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT
       (SELECT count(*)::int FROM members WHERE is_active) AS active_members,
       (SELECT count(*)::int FROM invoices WHERE status = 'pending') AS pending_invoices,
       (SELECT COALESCE(sum(amount_paise), 0)::int FROM payments
          WHERE status = 'paid' AND paid_at >= date_trunc('month', now())) AS collected_this_month_paise,
       (SELECT count(*)::int FROM payments
          WHERE status = 'pending' AND method IN ('upi', 'cash')) AS pending_verifications,
       (SELECT count(*)::int FROM payments WHERE status = 'paid') AS total_paid_payments,
       (SELECT COALESCE(sum(amount_paise), 0)::int FROM payments WHERE status = 'paid') AS total_collected_paise`
  );
  res.json(result.rows[0]);
}));

app.post('/api/admin/invoices/generate', requireAdmin, asyncRoute(async (req, res) => {
  const result = await lib.generateInvoices(req.body?.month);
  res.json({ ok: true, ...result });
}));

app.post('/api/admin/members', requireAdmin, asyncRoute(async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const phone = String(req.body?.phone || '').trim();
  if (!fullName || !phone) throw lib.httpError(400, 'fullName and phone are required.');

  const result = await query(
    `INSERT INTO members (full_name, phone, email, ward)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
     RETURNING id, full_name, phone, email, ward, is_active, created_at`,
    [fullName, phone, req.body?.email || '', req.body?.ward || '']
  );
  res.status(201).json({ ok: true, member: result.rows[0] });
}));

app.get('/api/admin/members', requireAdmin, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT m.id, m.full_name, m.phone, m.email, m.ward, m.is_active, m.created_at,
            count(i.id)::int AS invoice_count,
            count(p.id) FILTER (WHERE p.status = 'paid')::int AS paid_count
     FROM members m
     LEFT JOIN invoices i ON i.member_id = m.id
     LEFT JOIN payments p ON p.invoice_id = i.id
     GROUP BY m.id
     ORDER BY m.created_at DESC`
  );
  res.json({ members: result.rows });
}));

app.get('/api/admin/invoices', requireAdmin, asyncRoute(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.month) {
    params.push(lib.normalizeMonth(req.query.month));
    where = `WHERE i.billing_month = $1`;
  }
  const result = await query(
    `SELECT i.id, i.invoice_no, i.billing_month, i.amount_paise, i.due_date, i.status,
            m.full_name, m.phone,
            count(p.id)::int AS payment_count,
            max(p.paid_at) AS paid_at,
            max(p.receipt_no) AS receipt_no,
            max(p.id) AS payment_id
     FROM invoices i
     JOIN members m ON m.id = i.member_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     ${where}
     GROUP BY i.id, m.full_name, m.phone
     ORDER BY i.billing_month DESC, i.invoice_no DESC
     LIMIT 300`,
    params
  );
  res.json({ invoices: result.rows });
}));

app.get('/api/admin/payments', requireAdmin, asyncRoute(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE p.status = $1';
  }
  const result = await query(
    `SELECT p.*, i.invoice_no, m.full_name, m.phone
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN members m ON m.id = p.member_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT 300`,
    params
  );
  res.json({ payments: result.rows });
}));

app.post('/api/admin/payments/:id/verify', requireAdmin, asyncRoute(async (req, res) => {
  const existing = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) throw lib.httpError(404, 'Payment not found.');
  if (existing.rows[0].status === 'paid') throw lib.httpError(409, 'Payment is already verified.');

  const paid = await lib.markPaymentPaid(existing.rows[0].id, {
    verifiedBy: req.body?.verifiedBy || req.admin
  });
  res.json({ ok: true, receiptNo: paid.receipt_no, receiptUrl: receiptUrl(paid.id) });
}));

app.post('/api/admin/payments/:id/reject', requireAdmin, asyncRoute(async (req, res) => {
  const reason = String(req.body?.reason || '').trim() || 'Manual payment could not be verified.';
  const updated = await lib.updatePaymentStatus(req.params.id, 'rejected', {
    reason,
    verifiedBy: req.body?.verifiedBy || req.admin
  });
  res.json({ ok: true, status: updated.status });
}));

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------
app.use(express.static(publicDir, { index: 'index.html', extensions: ['html'] }));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'ECONNREFUSED' ? 503 : 500);
  if (status >= 500 && !err.status) console.error(`[${req.method} ${req.originalUrl}]`, err);
  const body = { error: err.status ? err.message : 'Internal server error.' };
  if (err.code === 'ECONNREFUSED') {
    body.hint = 'Postgres is not reachable. Start it with docker compose up -d and run npm run init-db.';
  }
  res.status(status).json(body);
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Haritha Karma Sena billing is running at ${config.appUrl}`);
    console.log(`Razorpay: ${config.razorpayConfigured ? 'configured' : 'not configured'}`);
    console.log(`UPI ID: ${config.upiId}`);
    if (config.adminToken === 'change-this-admin-token') {
      console.warn('Warning: change ADMIN_TOKEN in .env before real use.');
    }
  });
}

module.exports = app;
