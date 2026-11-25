# Haritha Karma Sena — unified portal

One website for members and HKS staff: OTP sign-in, monthly billing, payments,
digital receipts, an HKS admin console and a Green Points rewards wallet. All of
them share **one login and one data store**, so a payment verified by an admin
instantly appears in the member's history and credits Green Points.

There are two ways to run the project:

| Mode | Requirements | Use for |
| --- | --- | --- |
| **Unified demo** (recommended for review) | Python 3.10+ only | Full website, all APIs, no installation |
| **Production backend** | Node.js + PostgreSQL | Real Express/Prisma API reference |

---

## 1. Unified demo — run in one command

```powershell
python server.py
```

Open <http://localhost:8000>. No Node.js, npm or PostgreSQL needed.

### Pages

| Page | URL | Access |
| --- | --- | --- |
| Home / overview | `/index.html` | Public |
| Pay monthly fee | `/pay.html` | Member sign-in |
| Payment history | `/history.html` | Member sign-in |
| Admin / HKS console | `/admin.html` | Admin sign-in |
| Green Points wallet & store | `/rewards.html` | Member sign-in |
| Digital receipt | `/receipt.html?id=…` | Link from history/admin |

### Demo accounts

| Role | Phone | OTP |
| --- | --- | --- |
| Member | `9999999999` | `123456` |
| Admin / HKS | `9999999998` | `123456` |

Any other phone number creates a new resident account at sign-in. The OTP is
always shown on screen in demo mode. The role selector in the sign-in dialog
controls which account type is used; the admin console refuses member tokens.

### What stays in sync

- `/api/auth/*` — OTP request/verify, current user, logout (shared session).
- `/api/history` — the signed-in member's invoices, payments and receipt numbers.
- `/api/payments/upi` — member submits a UTR; payment becomes `PENDING`.
- `/api/payments/cash` — admin records cash; invoice is paid immediately.
- `/api/admin/payments/{id}/verify` — admin verifies UPI, issues a receipt and
  awards 50 Green Points.
- `/api/admin/collections/verify` — field verification awards 20 Green Points.
- `/api/rewards/*` — wallet, voucher store, redemption and coupon codes.
- `data/app_data.json` — the single JSON store for users, sessions, invoices,
  payments, collections, points, vouchers and coupons.

### Try the full loop

1. Sign in as the member (`9999999999` / `123456`).
2. Open **Pay now**, choose the unpaid invoice and submit any UTR.
3. Sign out, sign in as admin (`9999999998` / `123456`).
4. In **Payments awaiting verification**, click **Verify**. A receipt link is
   generated and 50 Green Points are credited.
5. Sign back in as the member. **Payment history** shows the receipt, and
   **Rewards** shows the new balance. Redeem a voucher to get a coupon code.

### Tests and checks

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
```

### Project layout (demo)

```text
.
├── server.py                  # one HTTP server for pages + API
├── src/
│   ├── hks_core.py            # single source of truth: users, bills, points, …
│   └── rewards_core.py        # compatibility layer for the original module
├── public/
│   ├── index.html             # home
│   ├── pay.html               # billing / payments
│   ├── history.html           # member payment history
│   ├── admin.html             # HKS admin console
│   ├── rewards.html           # Green Points wallet + store
│   ├── receipt.html           # printable digital receipt
│   ├── shared.js              # login, session and auth gate for every page
│   ├── app.js                 # billing, admin, history, receipt logic
│   ├── rewards-app.js         # wallet, vouchers, coupons
│   ├── styles.css             # plum / violet / coral / teal theme
│   └── rewards.css            # rewards-specific styling
├── tests/test_rewards.py      # unit tests
└── data/app_data.json         # created on first run; delete to reset the demo
```

---

## 2. Production backend (Node.js + Express + PostgreSQL)

The Express/Prisma code under `backend/` remains the production reference. It
uses the same OTP login flow (request → verify → JWT session).

### Prerequisites

Install [Git](https://git-scm.com/download/win), [Node.js LTS](https://nodejs.org/)
(24 recommended; 20 is deprecated on GitHub runners) and
[PostgreSQL](https://www.postgresql.org/download/windows/). Create the database:

```sql
CREATE DATABASE haritha_karma_sena;
```

### Setup

```powershell
cd backend
Copy-Item .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET, SEED_ADMIN_PHONE
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

API: <http://localhost:3000> · Health: <http://localhost:3000/health>

`OTP_PROVIDER=console` prints the code to the backend terminal in development.
Any other value is rejected at startup until a real SMS provider is added.

### OTP login example

```http
POST /api/auth/request-otp
Content-Type: application/json

{ "phone": "+919999999999", "purpose": "LOGIN" }
```

```http
POST /api/auth/verify-otp
Content-Type: application/json

{ "phone": "+919999999999", "code": "123456", "purpose": "LOGIN" }
```

Send the returned token as `Authorization: Bearer <token>`.

Detailed API docs: [`backend/docs/api.md`](backend/docs/api.md) ·
Schema: [`backend/docs/database-schema.md`](backend/docs/database-schema.md)

---

## Notes

- Do not commit `.env` or `data/app_data.json`; both are local state.
- The demo uses a fixed OTP (`123456`, overridable with `HKS_DEMO_OTP`) and a
  plain JSON store. Use the Node/Prisma stack for real deployments.
- GitHub CI runs the Python unit tests and the backend syntax/lint check.
