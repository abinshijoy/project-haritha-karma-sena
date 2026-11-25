# Project Haritha Karma Sena - Backend

Backend for **Project Haritha Karma Sena**, a college project for managing residents/users, HKS workers, bills, reward points, and OTP-based authentication.

## Tech Stack

- **Node.js + Express** - API server
- **PostgreSQL** - database
- **Prisma** - ORM/schema/migrations
- **JWT** - session tokens
- **Zod** - request validation
- **bcryptjs** - OTP hashing
- **helmet + cors + express-rate-limit** - basic security

## Project Structure

```text
.
â”œâ”€â”€ .github/                        # PR/issue templates, CI workflow
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ docs/
â”‚   â”‚   â”œâ”€â”€ api.md                  # Frontend-ready API documentation
â”‚   â”‚   â”œâ”€â”€ database-schema.md      # Database model explanation
â”‚   â”‚   â””â”€â”€ github-setup.md         # GitHub push/PR guide
â”‚   â”œâ”€â”€ prisma/
â”‚   â”‚   â”œâ”€â”€ schema.prisma           # Database schema
â”‚   â”‚   â””â”€â”€ seed.js                 # Creates/ensures admin user
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ config/env.js           # Env loading/validation
â”‚   â”‚   â”œâ”€â”€ controllers/            # Route handlers
â”‚   â”‚   â”œâ”€â”€ middleware/             # Auth, error handling
â”‚   â”‚   â”œâ”€â”€ models/prisma.js        # Prisma client
â”‚   â”‚   â”œâ”€â”€ routes/                 # Express routes
â”‚   â”‚   â”œâ”€â”€ services/otpService.js  # OTP create/verify/consume
â”‚   â”‚   â”œâ”€â”€ utils/                  # Crypto/errors helpers
â”‚   â”‚   â”œâ”€â”€ app.js                  # Express app
â”‚   â”‚   â””â”€â”€ server.js               # Server startup
â”‚   â”œâ”€â”€ .env.example
â”‚   â””â”€â”€ package.json
â””â”€â”€ README.md
```

## Features Implemented

### Authentication (OTP Login)
- `POST /api/auth/request-otp` - request OTP
- `POST /api/auth/verify-otp` - verify OTP, issue JWT
- `GET /api/auth/me` - current user
- `POST /api/auth/logout` - revoke current session

Security: OTP hashed in DB, expiry, max attempts, request cooldown, JWT session stored/checked/revoked.

### Users
- Admin: list/create users
- Admin or self: get/update user profile
- Fields include name, phone, role, address/ward, active status

### HKS Workers
- Admin: list/get/create/update workers
- Worker linked to a `User` account via `userId`
- Tracks employee code, status, assigned ward/area

### Bills
- Admin: create/update bills
- Admin or owner: list/get bills
- Tracks billing period, amount due/paid, status, due/paid dates, assigned worker

### Points
- Admin: create point ledger entries
- Admin or owner: list points, get balance
- Balance is calculated by DB aggregate (accurate total)

## Local Setup (Windows)

## Prerequisites
Install these first:
1. **Git** - for version control
2. **Node.js LTS (includes npm)** - runs backend
3. **PostgreSQL** - database

### Step-by-step installation

#### 1. Install Git
1. Go to https://git-scm.com/download/win
2. Download the 64-bit installer.
3. Run installer; default options are fine.
4. Open **PowerShell** and check:
   ```powershell
   git --version
   ```

#### 2. Install Node.js (includes npm)
1. Go to https://nodejs.org/
2. Download the **LTS** version for Windows.
3. Run installer (keep â€œAdd to PATHâ€ checked).
4. Restart PowerShell and check:
   ```powershell
   node -v
   npm -v
   ```
   Recommended: Node 20+.

#### 3. Install PostgreSQL
1. Go to https://www.postgresql.org/download/windows/
2. Download installer from EDB.
3. Install PostgreSQL, pgAdmin, and command line tools.
4. During install, set a password for the `postgres` user (remember it).
5. Keep default port `5432`.
6. Verify with:
   ```powershell
   psql --version
   ```
   If `psql` is not recognized, add PostgreSQL `bin` folder to PATH (e.g. `C:\Program Files\PostgreSQL\16\bin`) or use pgAdmin.

#### 4. Create database
Using pgAdmin or psql:
```sql
CREATE DATABASE haritha_karma_sena;
```

## Run Backend Locally

1. Open PowerShell in project folder.
2. Go to backend:
   ```powershell
   cd backend
   ```
3. Create env file:
   ```powershell
   Copy-Item .env.example .env
   ```
4. Edit `.env` and set:
   - `DATABASE_URL` with your PostgreSQL username/password
   - `JWT_SECRET` to a long random string
   - `SEED_ADMIN_PHONE` to your admin phone
5. Install dependencies:
   ```powershell
   npm install
   ```
6. Generate Prisma client:
   ```powershell
   npm run prisma:generate
   ```
7. Run migration (creates tables):
   ```powershell
   npm run prisma:migrate -- --name init
   ```
8. Seed admin user:
   ```powershell
   npm run prisma:seed
   ```
9. Start server:
   ```powershell
   npm run dev
   ```

Server: `http://localhost:3000`  
Health check: `http://localhost:3000/health`

## Test OTP Login (Development)

1. Request OTP:
   ```http
   POST /api/auth/request-otp
   Content-Type: application/json

   { "phone": "+919999999999", "purpose": "LOGIN" }
   ```
2. Check backend terminal for `[OTP][DEV] ... code=123456`.
3. Verify OTP:
   ```http
   POST /api/auth/verify-otp
   Content-Type: application/json

   { "phone": "+919999999999", "code": "123456", "purpose": "LOGIN" }
   ```
4. Copy `data.token` and use:
   ```http
   Authorization: Bearer <token>
   ```

## API Documentation

See [`backend/docs/api.md`](backend/docs/api.md) for endpoint details, request/response examples, auth flow, and frontend integration notes.

## Database Schema

See [`backend/docs/database-schema.md`](backend/docs/database-schema.md).

## GitHub / PR Workflow

See [`backend/docs/github-setup.md`](backend/docs/github-setup.md). Do not push secrets; `.env` is ignored.

## Important Notes

- **OTP provider is console in development**. Real SMS integration is required for production.
- This backend has been **code-reviewed and improved**, but it **cannot be fully runtime-tested in this environment** because Node.js/npm/PostgreSQL are not installed here. After installing prerequisites, run the commands above and test endpoints with Postman/Thunder Client.
- For production/real deployment: strong JWT secret, HTTPS, real SMS provider, stricter CORS, logging/monitoring, and proper migrations.
## Member 5 - Rewards module

The Green Points and voucher module lives in `rewards` paths so it does not overwrite the backend/frontend files:

- `src/rewards_core.py` - core logic (models, points, vouchers, coupons)
- `server.py` - stdlib HTTP API + demo UI server
- `public/rewards.html`, `public/rewards-app.js`, `public/rewards.css` - rewards demo UI
- `tests/test_rewards.py` - 7 unit tests
- `REWARDS_INTEGRATION.md` - integration payloads for Member 4 and Member 6

Run the demo with `python server.py` then open `http://localhost:8000/rewards.html`.
