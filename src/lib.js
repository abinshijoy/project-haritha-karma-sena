const crypto = require('crypto');
const config = require('./config');
const { query, withTransaction } = require('./db');

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeMonth(input) {
  const value = String(input || new Date().toISOString().slice(0, 7)).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw httpError(400, 'Month must be in YYYY-MM format.');
  }
  return `${value}-01`;
}

function monthLabel(dateValue) {
  if (!dateValue) return '';
  const [year, month] = String(dateValue).slice(0, 10).split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

function dueDateForMonth(monthDate) {
  const [year, month] = monthDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month, 10)).toISOString().slice(0, 10);
}

function invoiceNumberForMonth(monthDate, sequence) {
  const yyyymm = monthDate.slice(0, 7).replace('-', '');
  return `HKS-INV-${yyyymm}-${String(sequence).padStart(5, '0')}`;
}

function formatRupees(paise) {
  const value = Number(paise || 0) / 100;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function belowHundred(num) {
  if (num < 20) return ONES[num];
  const tens = TENS[Math.floor(num / 10)];
  const rem = num % 10;
  return rem ? `${tens}-${ONES[rem]}` : tens;
}

function integerToWords(num) {
  if (!num) return 'Zero';
  let remaining = num;
  const parts = [];

  const crores = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakhs = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousands = Math.floor(remaining / 1000);
  remaining %= 1000;
  const hundreds = Math.floor(remaining / 100);
  remaining %= 100;

  if (crores) parts.push(`${belowHundred(crores)} Crore`);
  if (lakhs) parts.push(`${belowHundred(lakhs)} Lakh`);
  if (thousands) parts.push(`${belowHundred(thousands)} Thousand`);
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (remaining) parts.push(belowHundred(remaining));

  return parts.join(' ');
}

function amountInWords(paise) {
  const rupees = Math.floor(Number(paise || 0) / 100);
  const paisePart = Number(paise || 0) % 100;
  let text = `Rupees ${integerToWords(rupees)}`;
  if (paisePart) text += ` and ${integerToWords(paisePart)} Paise`;
  return `${text} only`;
}

function hmacSha256(secret, data) {
  return crypto.createHmac('sha256', String(secret)).update(data).digest('hex');
}

function signaturesMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function createReceiptNo(client) {
  const seqResult = await client.query("SELECT nextval('receipt_seq') AS seq");
  const year = new Date().getUTCFullYear();
  return `HKS-RCPT-${year}-${String(seqResult.rows[0].seq).padStart(6, '0')}`;
}

async function generateInvoices(monthInput) {
  const billingMonth = normalizeMonth(monthInput);
  const dueDate = dueDateForMonth(billingMonth);

  return withTransaction(async (client) => {
    const members = await client.query(
      'SELECT id FROM members WHERE is_active = TRUE ORDER BY created_at, id'
    );
    let created = 0;
    let skipped = 0;

    for (const member of members.rows) {
      const seq = await client.query("SELECT nextval('invoice_seq') AS seq");
      const invoiceNo = invoiceNumberForMonth(billingMonth, Number(seq.rows[0].seq));
      const inserted = await client.query(
        `INSERT INTO invoices (invoice_no, member_id, billing_month, amount_paise, due_date, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (member_id, billing_month) DO NOTHING`,
        [invoiceNo, member.id, billingMonth, config.monthlyFeePaise, dueDate]
      );
      if (inserted.rowCount) created += 1;
      else skipped += 1;
    }

    return {
      billingMonth,
      dueDate,
      created,
      skipped,
      totalActiveMembers: members.rows.length,
      amountPaise: config.monthlyFeePaise
    };
  });
}

async function findInvoice({ invoiceId, phone }) {
  if (invoiceId) {
    const result = await query(
      `SELECT i.*, m.full_name, m.phone, m.email, m.ward
       FROM invoices i JOIN members m ON m.id = i.member_id
       WHERE i.id = $1`,
      [invoiceId]
    );
    return result.rows[0] || null;
  }

  if (phone) {
    const result = await query(
      `SELECT i.*, m.full_name, m.phone, m.email, m.ward
       FROM invoices i JOIN members m ON m.id = i.member_id
       WHERE m.phone = $1 AND i.status <> 'paid'
       ORDER BY i.billing_month DESC LIMIT 1`,
      [String(phone).trim()]
    );
    return result.rows[0] || null;
  }

  return null;
}

async function createPayment({ invoice, method, fields = {} }) {
  const result = await query(
    `INSERT INTO payments (
       invoice_id, member_id, amount_paise, method, status,
       razorpay_order_id, upi_ref, collected_by, reference
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      invoice.id,
      invoice.member_id,
      invoice.amount_paise,
      method,
      fields.status || 'pending',
      fields.razorpayOrderId || null,
      fields.upiRef || null,
      fields.collectedBy || null,
      fields.reference || null
    ]
  );
  return result.rows[0];
}

async function markPaymentPaid(paymentId, details = {}) {
  return withTransaction(async (client) => {
    const current = await client.query(
      'SELECT * FROM payments WHERE id = $1 FOR UPDATE',
      [paymentId]
    );
    if (!current.rowCount) throw httpError(404, 'Payment not found.');

    const payment = current.rows[0];
    const receiptNo = payment.receipt_no || (await createReceiptNo(client));

    await client.query(
      `UPDATE payments SET
         status = 'paid',
         paid_at = COALESCE(paid_at, now()),
         receipt_no = $2,
         razorpay_payment_id = COALESCE($3, razorpay_payment_id),
         razorpay_signature = COALESCE($4, razorpay_signature),
         upi_ref = COALESCE($5, upi_ref),
         collected_by = COALESCE($6, collected_by),
         reference = COALESCE($7, reference),
         verified_by = COALESCE($8, verified_by),
         verified_at = COALESCE($9, verified_at),
         failure_reason = NULL
       WHERE id = $1`,
      [
        paymentId,
        receiptNo,
        details.razorpayPaymentId || null,
        details.razorpaySignature || null,
        details.upiRef || null,
        details.collectedBy || null,
        details.reference || null,
        details.verifiedBy || null,
        details.verifiedAt || new Date().toISOString()
      ]
    );

    await client.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [
      payment.invoice_id
    ]);

    const receipt = await client.query(
      `SELECT p.*, i.invoice_no, i.billing_month, i.due_date,
              m.full_name, m.phone, m.email, m.ward
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN members m ON m.id = p.member_id
       WHERE p.id = $1`,
      [paymentId]
    );
    return receipt.rows[0];
  });
}

async function updatePaymentStatus(paymentId, status, extra = {}) {
  const result = await query(
    `UPDATE payments
     SET status = $2,
         failure_reason = COALESCE($3, failure_reason),
         verified_by = COALESCE($4, verified_by),
         verified_at = COALESCE($5, verified_at)
     WHERE id = $1
     RETURNING *`,
    [
      paymentId,
      status,
      extra.reason || null,
      extra.verifiedBy || null,
      status === 'rejected' || status === 'failed' ? new Date().toISOString() : null
    ]
  );
  if (!result.rowCount) throw httpError(404, 'Payment not found.');
  return result.rows[0];
}

async function getReceipt(paymentId) {
  const result = await query(
    `SELECT p.*, i.invoice_no, i.billing_month, i.due_date,
            m.full_name, m.phone, m.email, m.ward
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN members m ON m.id = p.member_id
     WHERE p.id = $1 AND p.status = 'paid'`,
    [paymentId]
  );
  return result.rows[0] || null;
}

function upiLink(invoice) {
  const params = new URLSearchParams({
    pa: config.upiId,
    pn: config.upiName,
    am: (Number(invoice.amount_paise) / 100).toFixed(2),
    cu: config.currency,
    tn: `HKS monthly fee ${monthLabel(invoice.billing_month)}`
  });
  return `upi://pay?${params.toString()}`;
}

module.exports = {
  httpError,
  normalizeMonth,
  monthLabel,
  dueDateForMonth,
  invoiceNumberForMonth,
  formatRupees,
  amountInWords,
  hmacSha256,
  signaturesMatch,
  generateInvoices,
  findInvoice,
  createPayment,
  markPaymentPaid,
  updatePaymentStatus,
  getReceipt,
  upiLink
};
