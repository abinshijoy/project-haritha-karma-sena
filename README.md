# Haritha Karma Sena — Billing & Payment Gateway

> Part of the [`project-haritha-karma-sena`](https://github.com/abinshijoy/project-haritha-karma-sena) team project (YIMS). This branch implements **Member 4: Billing & ₹50 Payment Gateway** (contributor: [@aparna113](https://github.com/aparna113)).

A local-first full-stack app for the **Rs. 50 monthly membership fee**:

- Monthly invoice generation for active members
- **Razorpay** hosted checkout with server-created orders and signature verification
- **Manual UPI** payments with QR/deep link + UTR submission and admin verification
- **Cash** collections recorded by an admin/volunteer
- Numbered **digital receipts** with printable / save-as-PDF view and verification QR
- **Payment history** lookup by registered phone number
- Admin console for members, bills, verification and reporting
- **PostgreSQL** persistence

The previous static “Chai & Co.” demo is preserved in `legacy-chai-demo/`.

---

## 1. Requirements

```bash
git clone git@github.com:abinshijoy/project-haritha-karma-sena.git
cd project-haritha-karma-sena
git checkout feature/billing-payments
```

- Node.js 18+ (verified on Node 26)
- PostgreSQL 14+ — either local, remote, or Docker
- Optional: Razorpay test keys for online card/UPI checkout

---

## 2. Setup

```powershell
# 1. Install dependencies
npm install

# 2. Create your environment file
Copy-Item .env.example .env
# Edit .env: set DATABASE_URL, ADMIN_TOKEN, UPI_ID, and Razorpay keys

# 3. Start Postgres (if using Docker)
docker compose up -d

# 4. Create tables and optional demo members
npm run init-db
npm run seed        # optional: adds 3 demo members

# 5. Start the app
npm start
```

Open <http://localhost:8000>.

Health check: <http://localhost:8000/api/health>

> If Docker is not available, point `DATABASE_URL` at any reachable Postgres database and run `npm run init-db`. Use `PGSSLMODE=require` for providers that need TLS.

---

## 3. Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `8000` |
| `APP_URL` | Public base URL used in receipts | `http://localhost:8000` |
| `DATABASE_URL` | Postgres connection string | local docker URL |
| `ADMIN_TOKEN` | Bearer token for admin API/pages | change this |
| `MONTHLY_FEE_PAISE` | Fee in paise | `5000` (Rs. 50) |
| `CURRENCY` | Razorpay currency | `INR` |
| `RAZORPAY_KEY_ID` | Razorpay key ID | empty |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret (server only) | empty |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret | falls back to key secret |
| `UPI_ID` | UPI ID shown on pay page / QR | `harithakarmasena@upi` |
| `UPI_NAME` | Payee name in UPI intent | `Haritha Karma Sena` |
| `PGSSLMODE` | Set to `require` for TLS Postgres | unset |

If Razorpay keys are absent, the Razorpay tab is disabled automatically; **manual UPI and cash still work**.

---

## 4. How the flows work

### Monthly billing

1. Sign in at `/admin.html` with `ADMIN_TOKEN`.
2. Choose a billing month (e.g. `2026-11`) and click **Generate invoices**.
3. One `HKS-INV-YYYYMM-#####` invoice of Rs. 50 is created per active member. Re-running the same month skips existing invoices.
4. Due date defaults to the 10th of the following month.

### Razorpay checkout

1. Member enters phone at `/pay.html` and selects an unpaid invoice.
2. `POST /api/payments/razorpay/order` creates a Razorpay order via the server (amount in paise) and stores a pending payment.
3. Razorpay Checkout collects payment.
4. `POST /api/payments/razorpay/verify` verifies `order_id|payment_id` HMAC signature, marks the invoice paid, and issues a receipt.
5. Optional webhook `POST /api/webhooks/razorpay` handles `payment.captured`, `order.paid` and `payment.failed` idempotently.

Razorpay webhook setup (test mode):

- URL: `https://your-domain/api/webhooks/razorpay`
- Events: `payment.captured`, `order.paid`, `payment.failed`
- Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.

### Manual UPI

1. Member scans the generated QR or opens the `upi://pay` link.
2. They submit the UTR/transaction reference.
3. Payment stays `pending` until an admin verifies it in `/admin.html`.
4. Verification creates the receipt; rejection records the reason.

### Cash

Admin enters member phone, selects the unpaid invoice, collector name and optional reference. The payment is marked paid and a receipt is generated immediately.

### Digital receipts & history

- Receipt URL format: `/receipt.html?id=<payment-uuid>`
- Print / Save as PDF button uses the browser print dialog.
- Receipt includes invoice number, billing month, amount in words, method, transaction ID, paid date and a verification QR.
- Members can search all bills at `/history.html` by phone.

---

## 5. Pages

| Page | URL | Description |
| --- | --- | --- |
| Home | `/index.html` | Overview and service status |
| Pay | `/pay.html` | Invoice lookup, Razorpay / UPI / cash info |
| History | `/history.html` | Invoice and receipt list by phone |
| Admin | `/admin.html` | Token-gated billing console |
| Receipt | `/receipt.html?id=…` | Printable digital receipt |

---

## 6. API outline

Public:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Server + DB status |
| `GET` | `/api/config` | Public payment configuration |
| `GET` | `/api/members/lookup?phone=…` | Member, invoices, payments, summary |
| `GET` | `/api/history?phone=…` | Alias for lookup |
| `POST` | `/api/payments/razorpay/order` | Create Razorpay order |
| `POST` | `/api/payments/razorpay/verify` | Verify signature + settle invoice |
| `POST` | `/api/payments/razorpay/fail` | Mark abandoned checkout failed |
| `POST` | `/api/payments/upi` | Submit manual UPI reference |
| `GET` | `/api/payments/upi/qr?invoiceId=…` | UPI QR PNG |
| `GET` | `/api/receipts/:paymentId` | Receipt data |
| `GET` | `/api/receipts/:paymentId/qr` | Verification QR PNG |
| `POST` | `/api/webhooks/razorpay` | Razorpay webhook |

Admin (`Authorization: Bearer <ADMIN_TOKEN>`):

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/overview` | Dashboard totals |
| `POST` | `/api/admin/invoices/generate` | Generate monthly invoices |
| `POST` | `/api/admin/members` | Add member |
| `GET` | `/api/admin/members` | List members |
| `GET` | `/api/admin/invoices?month=YYYY-MM` | List invoices |
| `GET` | `/api/admin/payments?status=pending` | List payments |
| `POST` | `/api/payments/cash` | Record cash payment |
| `POST` | `/api/admin/payments/:id/verify` | Verify manual UPI |
| `POST` | `/api/admin/payments/:id/reject` | Reject manual UPI |

---

## 7. Database

Tables: `members`, `invoices`, `payments`, `webhook_events`.

Schema: `db/schema.sql`. Optional demo data: `db/seed.sql`.

Money is stored as integer **paise** to avoid floating-point errors. Invoice and receipt numbers come from Postgres sequences. A unique constraint on `(member_id, billing_month)` prevents duplicate monthly bills.

Useful checks:

```sql
SELECT invoice_no, status, amount_paise FROM invoices ORDER BY created_at DESC LIMIT 10;
SELECT receipt_no, method, status, paid_at FROM payments ORDER BY created_at DESC LIMIT 10;
```

---

## 8. Production notes

- Change `ADMIN_TOKEN` before exposing the app.
- Serve over HTTPS; Razorpay Checkout requires a secure origin in production.
- Never put `RAZORPAY_KEY_SECRET` in frontend code — only `key_id` is sent to the browser.
- Keep `RAZORPAY_WEBHOOK_SECRET` distinct from the key secret where possible.
- Restrict phone-based history lookup or add OTP/auth before handling real member data.
- Back up Postgres and monitor `webhook_events` for failed deliveries.
- The current history lookup is intentionally simple for a local/demo deployment.
