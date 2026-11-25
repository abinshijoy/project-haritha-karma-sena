# Rewards Integration Guide (Member 5)

This module implements the Green Points and Voucher system for Haritha Karma Sena.
It is dependency-free (Python standard library) and can be used either as Python
functions or over HTTP.

## Run it

```bash
python server.py
# UI: http://localhost:8000
```

Seed vouchers are created automatically on startup. Data is stored in
`data/rewards_data.json`.

## Eco tiers

| Balance | Tier | Next |
| --- | --- | --- |
| 0–199 | Eco Starter | Green Guardian (200) |
| 200–499 | Green Guardian | Haritha Champion (500) |
| 500+ | Haritha Champion | — |

## Core function signatures

All functions live in `src/rewards_core.py`.

```python
add_green_points(user_id: str, points: int, reason: str, reference_id: str) -> dict
get_user_points_summary(user_id: str) -> dict
seed_default_vouchers() -> list[dict]
get_vouchers() -> list[dict]
get_user_coupons(user_id: str) -> list[dict]
redeem_voucher(user_id: str, voucher_id: str) -> dict
award_payment(user_id: str, bill_id: str, amount: int | float | None = None) -> dict
award_segregation(user_id: str, collection_id: str, verified: bool = True) -> dict
mark_coupon_used(coupon_code: str) -> dict
```

`referenceId` is unique across all transactions. Calling an award twice with the
same `billId` or `collectionId` raises `DUPLICATE_REFERENCE` (HTTP 409), so points
cannot be claimed twice.

## HTTP API

Base URL: `http://localhost:8000`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/rewards/summary?userId=<id>` | Balance, tier, transaction history |
| GET | `/api/rewards/vouchers` | All vouchers with stock |
| GET | `/api/rewards/coupons?userId=<id>` | Redeemed coupons for a user |
| POST | `/api/rewards/redeem` | Redeem a voucher |
| POST | `/api/rewards/award-payment` | Member 4: award bill points |
| POST | `/api/rewards/award-segregation` | Member 6: award segregation points |
| POST | `/api/rewards/seed` | Idempotent voucher seed |

### For Member 4 — Payments module

Award **+50 points** after a successful ₹50 monthly bill payment. Use the bill's
ID as `billId` so it cannot be claimed again.

```bash
curl -X POST http://localhost:8000/api/rewards/award-payment \
  -H "Content-Type: application/json" \
  -d '{"userId":"member-5","billId":"BILL-2026-11-001","amount":50}'
```

Python:

```python
from src.rewards_core import award_payment

award_payment("member-5", "BILL-2026-11-001", 50)
```

Response `201`:

```json
{
  "id": "…",
  "userId": "member-5",
  "points": 50,
  "type": "EARN",
  "reason": "Monthly HKS bill payment (₹50)",
  "referenceId": "BILL-2026-11-001",
  "createdAt": "2026-11-25T06:00:00Z"
}
```

Errors: `INVALID_AMOUNT` (422), `DUPLICATE_REFERENCE` (409).

### For Member 6 — HKS Worker / Admin portal

Award **+20 points** after verifying clean plastic/waste segregation for a
collection. Use the collection ID as `collectionId`.

```bash
curl -X POST http://localhost:8000/api/rewards/award-segregation \
  -H "Content-Type: application/json" \
  -d '{"userId":"member-5","collectionId":"COL-2026-11-014","verified":true}'
```

Python:

```python
from src.rewards_core import award_segregation

award_segregation("member-5", "COL-2026-11-014", True)
```

Errors: `NOT_VERIFIED` (422), `DUPLICATE_REFERENCE` (409).

### Redeem flow

```bash
curl -X POST http://localhost:8000/api/rewards/redeem \
  -H "Content-Type: application/json" \
  -d '{"userId":"member-5","voucherId":"<voucher-id>"}'
```

Response `201` includes `couponCode` (8 uppercase characters), `remainingPoints`,
`redeemedAt` and `status: ACTIVE`. Errors: `VOUCHER_NOT_FOUND` (404),
`OUT_OF_STOCK` (409), `INSUFFICIENT_POINTS` (409).

## Default vouchers

| Title | Points | Value | Stock |
| --- | --- | --- | --- |
| ₹10 Off Next HKS Monthly Bill | 100 | ₹10 | 100 |
| ₹50 Supplyco / Local Grocery Discount | 250 | ₹50 | 50 |
| Free Organic Compost & Grow Bag | 150 | — | 40 |
| ₹25 Milma Booth Voucher | 120 | ₹25 | 60 |

## Tests

```bash
python -m unittest discover -s tests -v
```
