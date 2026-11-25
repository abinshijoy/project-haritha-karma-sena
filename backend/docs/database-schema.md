# Database Schema - Project Haritha Karma Sena

This document describes the backend data model (Prisma/PostgreSQL).

## Models

## `User`
Represents residents/customers and admins.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| name | String | Display name |
| phone | String | Unique, used for OTP login |
| email | String? | Optional, unique |
| role | `UserRole` | `RESIDENT` or `ADMIN` |
| addressLine1/2, ward, panchayat, district, postalCode | String? | Address/location |
| isActive | Boolean | Disable login/access when false |
| createdAt/updatedAt | DateTime | Audit fields |

Relations: optional `HksWorker`, many `Bill`, many `PointLedger`, many `OtpChallenge`, many `AuthSession`.

## `HksWorker`
Haritha Karma Sena worker profile linked to a user.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | Unique FK to `User` |
| employeeCode | String | Unique worker code |
| status | `WorkerStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| assignedWard/assignedArea | String? | Work assignment |
| joinedAt | DateTime | Default now |

Relations: belongs to `User`; has many collected `Bill`s.

## `Bill`
Service/waste collection bill for a user.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | FK to `User` |
| workerId | String? | FK to `HksWorker` |
| billNumber | String | Unique business number |
| periodStart/periodEnd | DateTime | Billing period |
| amountDue/amountPaid | Decimal(10,2) | Money values |
| status | `BillStatus` | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED` |
| dueDate/paidAt | DateTime? | Payment dates |
| notes | String? | Optional |

Relations: belongs to `User`, optional `HksWorker`, has many `PointLedger` entries.

## `PointLedger`
Append-only points ledger. Balance = sum of `points`.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | FK to `User` |
| billId | String? | Optional FK to `Bill` |
| points | Int | Positive or negative; zero not allowed by API |
| reason | `PointReason` | `BILL_PAYMENT`, `WASTE_SEGREGATION`, `SPECIAL_CAMPAIGN`, `ADJUSTMENT` |
| description | String? | Note |
| createdAt | DateTime | Ledger time |

## `OtpChallenge`
OTP verification records.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String? | Optional FK |
| phone | String | Target phone |
| codeHash | String | Bcrypt hash of OTP |
| purpose | `OtpPurpose` | `LOGIN`, `VERIFY_PHONE`, `RESET` (RESET reserved) |
| status | `OtpStatus` | `PENDING`, `VERIFIED`, `EXPIRED`, `CONSUMED` |
| expiresAt | DateTime | Required expiry time |
| verifiedAt/consumedAt | DateTime? | Optional lifecycle timestamps |
| attempts/maxAttempts | Int | Brute-force protection |

## `AuthSession`
Tracks issued JWT sessions for validation/revocation.

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| userId | String | FK to `User` |
| tokenHash | String | SHA-256 hash of JWT, unique |
| expiresAt | DateTime | Session expiry |
| revokedAt | DateTime? | Set on logout |
| userAgent/ipAddress | String? | Audit info |

## Design notes

- **OTP is never stored in plain text**; only hash is stored.
- **Sessions are revocable** because the backend stores token hashes and checks them in auth middleware.
- **Point balance is auditable** using ledger entries instead of overwriting a single balance field.
- **Decimal for money** avoids floating-point rounding issues.

## Migration commands

```powershell
cd backend
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```