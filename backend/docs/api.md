# Haritha Karma Sena Backend API Documentation

This document is for frontend developers and testers connecting to the backend.

## Base URL

- Local: `http://localhost:3000`
- All API routes are prefixed with `/api` (the health check `GET /health` is the only exception)

## Authentication

The backend uses **OTP-based login** (passwordless).

1. **Request OTP**: `POST /api/auth/request-otp` with phone number.
2. **Verify OTP**: `POST /api/auth/verify-otp` with phone + code. Returns a JWT token.
3. **Use token**: Send `Authorization: Bearer <token>` header on protected routes.
4. **Get current user**: `GET /api/auth/me`.
5. **Logout**: `POST /api/auth/logout` revokes the current session.

### Development OTP
When `OTP_PROVIDER=console`, the OTP code is printed in the backend terminal. Check the terminal running `npm run dev`.

## Common response format

### Success
```json
{
  "success": true,
  "message": "Optional message",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": ...
  }
}
```

Common error codes: `VALIDATION_ERROR`, `DUPLICATE_VALUE`, `NOT_FOUND`, `INVALID_REFERENCE`, `RATE_LIMITED`, `REQUEST_ERROR`, `INTERNAL_ERROR`.

## Endpoints

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Service and DB health status |

---

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/request-otp` | No | Request OTP for login/phone verification |
| POST | `/api/auth/verify-otp` | No | Verify OTP and receive JWT |
| GET | `/api/auth/me` | Bearer | Get logged-in user profile |
| POST | `/api/auth/logout` | Bearer | Revoke current session |

#### POST `/api/auth/request-otp`
Body:
```json
{ "phone": "+919999999999", "name": "Optional name", "purpose": "LOGIN" }
```
- `purpose`: `LOGIN` (default) or `VERIFY_PHONE`
- For `LOGIN`, a new resident user is created if the phone is not registered.

Response `201`:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "challengeId": "...",
    "expiresAt": "2026-...",
    "devNote": "OTP is printed in the backend terminal (development mode)."
  }
}
```

#### POST `/api/auth/verify-otp`
Body:
```json
{ "phone": "+919999999999", "code": "123456", "purpose": "LOGIN" }
```
Response `200`:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "tokenType": "Bearer",
    "expiresAt": "2026-...",
    "user": { "id": "...", "name": "...", "phone": "...", "role": "RESIDENT", ... }
  }
}
```

---

### Users
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/users` | Bearer | ADMIN | List users (supports `limit,offset,role,ward,isActive`) |
| POST | `/api/users` | Bearer | ADMIN | Create user |
| GET | `/api/users/:id` | Bearer | ADMIN or self | Get user with recent bills/points |
| PATCH | `/api/users/:id` | Bearer | ADMIN or self | Update user (non-admin cannot change role/isActive) |

#### POST `/api/users` (ADMIN)
```json
{
  "name": "Jane",
  "phone": "+919888888888",
  "email": "jane@example.com",
  "role": "RESIDENT",
  "ward": "12",
  "panchayat": "Sample",
  "district": "Sample",
  "addressLine1": "House 1",
  "postalCode": "680001"
}
```

#### PATCH `/api/users/:id`
```json
{ "name": "New Name", "ward": "10", "isActive": true }
```

---

### HKS Workers
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/workers` | Bearer | ADMIN | List workers (`limit,offset,status,assignedWard`) |
| GET | `/api/workers/:id` | Bearer | ADMIN | Get worker details + recent collected bills |
| POST | `/api/workers` | Bearer | ADMIN | Create worker profile for an existing user |
| PATCH | `/api/workers/:id` | Bearer | ADMIN | Update worker assignment/status |

#### POST `/api/workers`
```json
{
  "userId": "<user-id>",
  "employeeCode": "HKS-001",
  "assignedWard": "12",
  "assignedArea": "Area A",
  "status": "ACTIVE"
}
```

#### PATCH `/api/workers/:id`
```json
{ "status": "INACTIVE", "assignedWard": "15" }
```

---

### Bills
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/bills` | Bearer | Any | Admin sees all; resident sees own. Filters: `status,userId(ADMIN),limit,offset` |
| GET | `/api/bills/:id` | Bearer | ADMIN or owner | Get bill detail |
| POST | `/api/bills` | Bearer | ADMIN | Create bill |
| PATCH | `/api/bills/:id` | Bearer | ADMIN | Update bill / mark paid/cancelled |

#### POST `/api/bills`
```json
{
  "userId": "<user-id>",
  "workerId": "<worker-id or null>",
  "billNumber": "BILL-2026-001",
  "periodStart": "2026-04-01T00:00:00.000Z",
  "periodEnd": "2026-04-30T23:59:59.000Z",
  "amountDue": 150.50,
  "dueDate": "2026-05-10T00:00:00.000Z",
  "notes": "Monthly collection"
}
```

#### PATCH `/api/bills/:id` (mark paid example)
```json
{ "status": "PAID", "amountPaid": 150.50 }
```
When status becomes `PAID`, `paidAt` is set automatically (if not already set) and `amountPaid` defaults to `amountDue` if omitted.

---

### Points
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/points` | Bearer | Any | Admin sees all; resident sees own. Includes accurate `balance` aggregate |
| GET | `/api/points/balance/:userId` | Bearer | ADMIN or self | Get point balance for a user |
| POST | `/api/points` | Bearer | ADMIN | Create point ledger entry |

#### POST `/api/points`
```json
{
  "userId": "<user-id>",
  "billId": "<bill-id or null>",
  "points": 10,
  "reason": "BILL_PAYMENT",
  "description": "Paid on time"
}
```
`reason` values: `BILL_PAYMENT`, `WASTE_SEGREGATION`, `SPECIAL_CAMPAIGN`, `ADJUSTMENT`. `points` can be negative for adjustments but not zero.

---

## Frontend integration notes

- Store JWT securely (for college demo, localStorage is acceptable; explain risks in report).
- Send `Authorization: Bearer <token>` on every protected request.
- Handle `401` by clearing token and redirecting to login.
- Handle `403` as “not allowed”.
- Validate forms on frontend too, but rely on backend validation as source of truth.
- For OTP login in dev, watch backend terminal for `[OTP][DEV] ... code=...`.

## Security notes

- OTP codes are hashed in DB.
- OTP has expiry, max attempts, and request cooldown.
- JWT sessions are stored as hashed token records and checked on every request; logout revokes session.
- Rate limiting is enabled for API and stricter for auth routes.
- CORS is configurable via `CORS_ORIGIN`.
- Do not commit `.env`. Use `.env.example` as template.