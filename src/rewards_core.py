"""Core Green Points and Rewards logic for Haritha Karma Sena.

Standard library only. State is persisted as JSON so the module can be used
from the HTTP server, scripts, or tests without any external dependencies.
"""

from __future__ import annotations

import json
import secrets
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "rewards_data.json"
_LOCK = threading.RLock()

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
EARN = "EARN"
REDEEM = "REDEEM"
ACTIVE = "ACTIVE"
USED = "USED"

_DEFAULT_VOUCHERS = [
    {
        "title": "₹10 Off Next HKS Monthly Bill",
        "description": "Save ₹10 on your next monthly Haritha Karma Sena bill.",
        "pointsRequired": 100,
        "discountValue": 10,
        "category": "bill",
        "expiryDate": "2027-03-31T23:59:59Z",
        "stock": 100,
    },
    {
        "title": "₹50 Supplyco / Local Grocery Discount",
        "description": "₹50 off at participating Supplyco and local grocery stores.",
        "pointsRequired": 250,
        "discountValue": 50,
        "category": "grocery",
        "expiryDate": "2027-03-31T23:59:59Z",
        "stock": 50,
    },
    {
        "title": "Free Organic Compost & Grow Bag",
        "description": "Collect a free organic compost pack and grow bag.",
        "pointsRequired": 150,
        "discountValue": 0,
        "category": "garden",
        "expiryDate": "2027-06-30T23:59:59Z",
        "stock": 40,
    },
    {
        "title": "₹25 Milma Booth Voucher",
        "description": "₹25 voucher redeemable at Milma booths.",
        "pointsRequired": 120,
        "discountValue": 25,
        "category": "dairy",
        "expiryDate": "2027-03-31T23:59:59Z",
        "stock": 60,
    },
]


class RewardsError(Exception):
    """A validation or business-rule error safe to return to API clients."""

    def __init__(self, message: str, status: int = 400, code: str = "REWARDS_ERROR"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def configure_data_file(path: str | Path) -> None:
    """Point persistence at another file (useful for tests)."""
    global DATA_FILE
    with _LOCK:
        DATA_FILE = Path(path)


def _empty_state() -> dict[str, list[dict[str, Any]]]:
    return {"transactions": [], "vouchers": [], "redeemed": []}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _load() -> dict[str, list[dict[str, Any]]]:
    with _LOCK:
        if not DATA_FILE.exists():
            return _empty_state()
        try:
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return _empty_state()
        for key in ("transactions", "vouchers", "redeemed"):
            data.setdefault(key, [])
        return data


def _save(state: dict[str, Any]) -> None:
    with _LOCK:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def _new_id() -> str:
    return uuid.uuid4().hex


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RewardsError(f"{label} is required.")
    return value.strip()


def _require_int(value: Any, label: str, minimum: int = 1) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise RewardsError(f"{label} must be an integer >= {minimum}.")
    return value


def get_tier(balance: int) -> dict[str, Any]:
    """Return the eco tier, next tier and points needed to reach it."""
    if balance >= 500:
        return {"name": "Haritha Champion", "next": None, "pointsToNext": 0}
    if balance >= 200:
        return {"name": "Green Guardian", "next": "Haritha Champion", "pointsToNext": 500 - balance}
    return {"name": "Eco Starter", "next": "Green Guardian", "pointsToNext": 200 - balance}


def _balance_for(user_id: str, transactions: list[dict[str, Any]]) -> int:
    balance = 0
    for tx in transactions:
        if tx.get("userId") != user_id:
            continue
        points = int(tx.get("points", 0))
        balance += points if tx.get("type") == EARN else -abs(points)
    return balance


def _generate_coupon_code(redeemed: list[dict[str, Any]]) -> str:
    existing = {item.get("couponCode") for item in redeemed}
    while True:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
        if code not in existing:
            return code


def add_green_points(
    user_id: str,
    points: int,
    reason: str,
    reference_id: str,
) -> dict[str, Any]:
    """Award points. A referenceId can only be used once (duplicate protection)."""
    user_id = _require_text(user_id, "userId")
    points = _require_int(points, "points")
    reason = _require_text(reason, "reason")
    reference_id = _require_text(reference_id, "referenceId")

    with _LOCK:
        state = _load()
        if any(tx.get("referenceId") == reference_id for tx in state["transactions"]):
            raise RewardsError("These points were already awarded for this reference.", status=409, code="DUPLICATE_REFERENCE")

        transaction = {
            "id": _new_id(),
            "userId": user_id,
            "points": points,
            "type": EARN,
            "reason": reason,
            "referenceId": reference_id,
            "createdAt": _now(),
        }
        state["transactions"].append(transaction)
        _save(state)
        return deepcopy(transaction)


def get_user_points_summary(user_id: str) -> dict[str, Any]:
    """Return current balance, tier progress and full transaction history."""
    user_id = _require_text(user_id, "userId")
    with _LOCK:
        transactions = [
            deepcopy(tx) for tx in _load()["transactions"] if tx.get("userId") == user_id
        ]
    transactions.sort(key=lambda tx: tx.get("createdAt", ""), reverse=True)
    balance = _balance_for(user_id, transactions)
    return {
        "userId": user_id,
        "balance": balance,
        "tier": get_tier(balance)["name"],
        "tierProgress": get_tier(balance),
        "transactions": transactions,
    }


def seed_default_vouchers() -> list[dict[str, Any]]:
    """Idempotently add the default Kerala HKS rewards."""
    with _LOCK:
        state = _load()
        titles = {v.get("title") for v in state["vouchers"]}
        for item in _DEFAULT_VOUCHERS:
            if item["title"] in titles:
                continue
            state["vouchers"].append({"id": _new_id(), **deepcopy(item)})
            titles.add(item["title"])
        _save(state)
        return [deepcopy(v) for v in state["vouchers"]]


def get_vouchers() -> list[dict[str, Any]]:
    with _LOCK:
        return [deepcopy(v) for v in _load()["vouchers"]]


def get_user_coupons(user_id: str) -> list[dict[str, Any]]:
    user_id = _require_text(user_id, "userId")
    with _LOCK:
        state = _load()
        vouchers = {v["id"]: v for v in state["vouchers"]}
        coupons = []
        for item in state["redeemed"]:
            if item.get("userId") != user_id:
                continue
            voucher = vouchers.get(item.get("voucherId"), {})
            coupons.append(
                {
                    **deepcopy(item),
                    "title": voucher.get("title", "Unknown voucher"),
                    "description": voucher.get("description", ""),
                    "expiryDate": voucher.get("expiryDate"),
                    "discountValue": voucher.get("discountValue", 0),
                }
            )
        coupons.sort(key=lambda c: c.get("redeemedAt", ""), reverse=True)
        return coupons


def redeem_voucher(user_id: str, voucher_id: str) -> dict[str, Any]:
    """Check balance and stock, deduct points, reduce stock and issue a coupon."""
    user_id = _require_text(user_id, "userId")
    voucher_id = _require_text(voucher_id, "voucherId")

    with _LOCK:
        state = _load()
        voucher = next((v for v in state["vouchers"] if v.get("id") == voucher_id), None)
        if voucher is None:
            raise RewardsError("Voucher not found.", status=404, code="VOUCHER_NOT_FOUND")

        cost = int(voucher.get("pointsRequired", 0))
        if int(voucher.get("stock", 0)) <= 0:
            raise RewardsError("This voucher is out of stock.", status=409, code="OUT_OF_STOCK")

        balance = _balance_for(user_id, state["transactions"])
        if balance < cost:
            raise RewardsError(
                f"Not enough Green Points. You need {cost}, you have {balance}.",
                status=409,
                code="INSUFFICIENT_POINTS",
            )

        deduction = {
            "id": _new_id(),
            "userId": user_id,
            "points": -cost,
            "type": REDEEM,
            "reason": f"Redeemed voucher: {voucher.get('title')}",
            "referenceId": f"redeem:{_new_id()}",
            "createdAt": _now(),
        }
        state["transactions"].append(deduction)
        voucher["stock"] = int(voucher.get("stock", 0)) - 1

        coupon = {
            "id": _new_id(),
            "userId": user_id,
            "voucherId": voucher_id,
            "couponCode": _generate_coupon_code(state["redeemed"]),
            "status": ACTIVE,
            "redeemedAt": _now(),
        }
        state["redeemed"].append(coupon)
        _save(state)
        return {
            **deepcopy(coupon),
            "title": voucher.get("title"),
            "pointsSpent": cost,
            "remainingPoints": balance - cost,
        }


def award_payment(user_id: str, bill_id: str, amount: int | float | None = None) -> dict[str, Any]:
    """Member 4 integration: +50 points for a confirmed ₹50 monthly bill."""
    bill_id = _require_text(bill_id, "billId")
    if amount is not None:
        try:
            if float(amount) < 50:
                raise RewardsError("Only ₹50 or above monthly bills earn points.", status=422, code="INVALID_AMOUNT")
        except (TypeError, ValueError):
            raise RewardsError("amount must be a number.", status=422, code="INVALID_AMOUNT")
    return add_green_points(
        user_id,
        50,
        "Monthly HKS bill payment (₹50)",
        bill_id,
    )


def award_segregation(user_id: str, collection_id: str, verified: bool = True) -> dict[str, Any]:
    """Member 6 integration: +20 points for verified clean waste segregation."""
    collection_id = _require_text(collection_id, "collectionId")
    if verified is not True:
        raise RewardsError("Segregation must be verified before awarding points.", status=422, code="NOT_VERIFIED")
    return add_green_points(
        user_id,
        20,
        "Clean plastic/waste segregation verified by HKS worker",
        collection_id,
    )


def mark_coupon_used(coupon_code: str) -> dict[str, Any]:
    coupon_code = _require_text(coupon_code, "couponCode").upper()
    with _LOCK:
        state = _load()
        coupon = next((c for c in state["redeemed"] if c.get("couponCode") == coupon_code), None)
        if coupon is None:
            raise RewardsError("Coupon not found.", status=404, code="COUPON_NOT_FOUND")
        coupon["status"] = USED
        _save(state)
        return deepcopy(coupon)


def reset_state() -> None:
    """Clear all data (used by tests)."""
    with _LOCK:
        _save(_empty_state())
