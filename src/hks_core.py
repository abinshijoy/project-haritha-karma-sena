"""Single source of truth for the unified Haritha Karma Sena demo.

Everything the website needs -- users, OTP sessions, invoices, payments,
HKS worker collections and Green Points -- lives in one JSON store. This keeps
the member portal, admin console, billing and rewards wallet in sync.

The module uses only the Python standard library so the complete website can
run with `python server.py` without Node.js or PostgreSQL.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import uuid
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "app_data.json"
_LOCK = threading.RLock()

EARN = "EARN"
REDEEM = "REDEEM"
ACTIVE = "ACTIVE"
USED = "USED"
PENDING = "PENDING"
PAID = "PAID"
REJECTED = "REJECTED"

MONTHLY_FEE_PAISE = 5000
SESSION_TTL_DAYS = 7
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
DEMO_OTP = os.environ.get("HKS_DEMO_OTP", "123456")
ADMIN_PHONE = "9999999998"
MEMBER_PHONE = "9999999999"

_DEFAULT_VOUCHERS: list[dict[str, Any]] = [
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


class AppError(Exception):
    """A validation/business error safe to send to API clients."""

    def __init__(self, message: str, status: int = 400, code: str = "APP_ERROR"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def configure_data_file(path: str | Path) -> None:
    """Redirect persistence (used by tests)."""
    global DATA_FILE
    with _LOCK:
        DATA_FILE = Path(path)


def _empty_state() -> dict[str, Any]:
    return {
        "seeded": False,
        "users": [],
        "otpChallenges": [],
        "sessions": [],
        "invoices": [],
        "payments": [],
        "collections": [],
        "points": [],
        "vouchers": [],
        "coupons": [],
    }


def _load() -> dict[str, Any]:
    with _LOCK:
        if not DATA_FILE.exists():
            return _empty_state()
        try:
            state = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return _empty_state()
        if not isinstance(state, dict):
            return _empty_state()
        for key, default in _empty_state().items():
            state.setdefault(key, deepcopy(default))
        return state


def _save(state: dict[str, Any]) -> None:
    with _LOCK:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def reset_state() -> None:
    """Clear every record (used by tests and demo reset)."""
    with _LOCK:
        _save(_empty_state())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _new_id(prefix: str = "") -> str:
    value = uuid.uuid4().hex
    return f"{prefix}-{value}" if prefix else value


def _month(offset: int = 0) -> str:
    today = date.today()
    index = today.month - 1 + offset
    year = today.year + index // 12
    month = index % 12 + 1
    return f"{year:04d}-{month:02d}"


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AppError(f"{label} is required.", 400, "VALIDATION_ERROR")
    return value.strip()


def _require_int(value: Any, label: str, minimum: int = 1) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise AppError(f"{label} must be an integer >= {minimum}.", 400, "VALIDATION_ERROR")
    return value


def normalize_phone(value: Any) -> str:
    phone = _require_text(value, "phone")
    digits = "".join(char for char in phone if char.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if not 8 <= len(digits) <= 15:
        raise AppError("Enter a valid phone number (8-15 digits).", 400, "VALIDATION_ERROR")
    return digits


def _hash_otp(code: str) -> str:
    return hashlib.sha256(f"hks-demo:{code}".encode("utf-8")).hexdigest()


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "email": user.get("email"),
        "role": user.get("role", "RESIDENT"),
        "ward": user.get("ward"),
        "panchayat": user.get("panchayat"),
        "district": user.get("district"),
        "isActive": bool(user.get("isActive", True)),
        "createdAt": user.get("createdAt"),
    }


def _find_user_by_phone(state: dict[str, Any], phone: str) -> dict[str, Any] | None:
    return next((user for user in state["users"] if user.get("phone") == phone), None)


def _find_user_by_id(state: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    return next((user for user in state["users"] if user.get("id") == user_id), None)


def _make_user(
    name: str,
    phone: str,
    role: str = "RESIDENT",
    ward: str | None = None,
    email: str | None = None,
) -> dict[str, Any]:
    return {
        "id": _new_id("usr"),
        "name": name,
        "phone": normalize_phone(phone),
        "role": role if role in ("RESIDENT", "ADMIN") else "RESIDENT",
        "email": email or None,
        "ward": ward or None,
        "panchayat": None,
        "district": None,
        "addressLine1": None,
        "addressLine2": None,
        "postalCode": None,
        "isActive": True,
        "createdAt": _now(),
    }


def seed_default_vouchers() -> list[dict[str, Any]]:
    """Idempotently add the default Kerala HKS rewards."""
    with _LOCK:
        state = _load()
        titles = {voucher.get("title") for voucher in state["vouchers"]}
        for item in _DEFAULT_VOUCHERS:
            if item["title"] in titles:
                continue
            state["vouchers"].append({"id": _new_id("vch"), **deepcopy(item)})
            titles.add(item["title"])
        _save(state)
        return [deepcopy(voucher) for voucher in state["vouchers"]]


def get_vouchers() -> list[dict[str, Any]]:
    with _LOCK:
        return [deepcopy(voucher) for voucher in _load()["vouchers"]]


def _make_invoice(member: dict[str, Any], month: str) -> dict[str, Any]:
    return {
        "id": _new_id("inv"),
        "invoiceNo": f"HKS-{month}-{member['phone'][-4:]}",
        "memberId": member["id"],
        "billingMonth": month,
        "amountPaise": MONTHLY_FEE_PAISE,
        "dueDate": f"{month}-28",
        "status": PENDING,
        "createdAt": _now(),
    }


def _make_payment(
    invoice: dict[str, Any],
    member: dict[str, Any],
    method: str,
    status: str,
    **extra: Any,
) -> dict[str, Any]:
    payment: dict[str, Any] = {
        "id": _new_id("pay"),
        "invoiceId": invoice["id"],
        "memberId": member["id"],
        "amountPaise": invoice["amountPaise"],
        "method": method,
        "status": status,
        "paidAt": _now() if status == PAID else None,
        "receiptNo": None,
        "upiRef": None,
        "razorpayPaymentId": None,
        "reference": None,
        "collectedBy": None,
        "verifiedBy": None,
        "failureReason": None,
        "createdAt": _now(),
    }
    if status == PAID:
        payment["receiptNo"] = f"RCT-{invoice['billingMonth']}-{uuid.uuid4().hex[:4].upper()}"
    payment.update(extra)
    return payment


def ensure_seed_data() -> None:
    """Create the demo accounts, bills and vouchers once."""
    with _LOCK:
        state = _load()
        if state.get("seeded") and state["users"]:
            return

        if not _find_user_by_phone(state, ADMIN_PHONE):
            state["users"].append(_make_user("HKS Admin", ADMIN_PHONE, "ADMIN", "Central Office"))
        for name, phone, ward in (
            ("Demo Member", MEMBER_PHONE, "Ward 5"),
            ("Anitha Nair", "8888888888", "Ward 4"),
            ("Raju Kumar", "7777777777", "Ward 6"),
        ):
            if not _find_user_by_phone(state, phone):
                state["users"].append(_make_user(name, phone, "RESIDENT", ward))

        member = _find_user_by_phone(state, MEMBER_PHONE)
        if member:
            for offset in (-1, 0):
                month = _month(offset)
                invoice = next(
                    (item for item in state["invoices"]
                     if item.get("memberId") == member["id"] and item.get("billingMonth") == month),
                    None,
                )
                if invoice is None:
                    invoice = _make_invoice(member, month)
                    state["invoices"].append(invoice)
                if offset == -1 and not any(
                    item.get("invoiceId") == invoice["id"] and item.get("status") == PAID
                    for item in state["payments"]
                ):
                    state["payments"].append(
                        _make_payment(invoice, member, "upi", PAID, upi_ref="DEMOUPI123456", verified_by="admin")
                    )
                    invoice["status"] = PAID

        state["seeded"] = True
        _save(state)

    seed_default_vouchers()


# ---------------------------------------------------------------------------
# Authentication and sessions
# ---------------------------------------------------------------------------
def request_otp(phone: Any, name: Any = None, role: Any = "RESIDENT") -> dict[str, Any]:
    phone = normalize_phone(phone)
    requested_role = "ADMIN" if str(role).upper() == "ADMIN" else "RESIDENT"

    with _LOCK:
        state = _load()
        user = _find_user_by_phone(state, phone)
        if requested_role == "ADMIN" and (user is None or user.get("role") != "ADMIN"):
            raise AppError("Admin sign-in is only available for the registered HKS admin account.", 403, "ADMIN_ONLY")

        if user is None:
            display_name = _require_text(name, "name") if name else f"Member {phone[-4:]}"
            user = _make_user(display_name, phone, "RESIDENT")
            state["users"].append(user)
        elif name and str(name).strip() and str(user.get("name", "")).startswith("Member "):
            user["name"] = str(name).strip()

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=5)
        recent = [
            item for item in state["otpChallenges"]
            if item.get("phone") == phone
            and item.get("status") == PENDING
            and datetime.fromisoformat(str(item.get("createdAt", "")).replace("Z", "+00:00")) > cutoff
        ]
        if recent:
            raise AppError("Please wait a moment before requesting another OTP.", 429, "OTP_COOLDOWN")

        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(
            timespec="seconds"
        ).replace("+00:00", "Z")
        challenge = {
            "id": _new_id("otp"),
            "phone": phone,
            "codeHash": _hash_otp(DEMO_OTP),
            "name": name or None,
            "role": requested_role,
            "purpose": "LOGIN",
            "status": PENDING,
            "attempts": 0,
            "maxAttempts": OTP_MAX_ATTEMPTS,
            "expiresAt": expires_at,
            "createdAt": _now(),
        }
        state["otpChallenges"].append(challenge)
        _save(state)
        return {
            "phone": phone,
            "expiresAt": expires_at,
            "devCode": DEMO_OTP,
            "message": "OTP sent. In this demo the code is always shown on screen.",
        }


def verify_otp(phone: Any, code: Any, name: Any = None) -> dict[str, Any]:
    phone = normalize_phone(phone)
    code = _require_text(code, "OTP code")

    with _LOCK:
        state = _load()
        challenges = [
            item for item in state["otpChallenges"]
            if item.get("phone") == phone and item.get("status") == PENDING
        ]
        if not challenges:
            raise AppError("No active OTP found. Request a new code.", 400, "OTP_NOT_FOUND")
        challenge = challenges[-1]

        expires_at = datetime.fromisoformat(str(challenge.get("expiresAt", "")).replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            challenge["status"] = "EXPIRED"
            _save(state)
            raise AppError("OTP expired. Request a new code.", 400, "OTP_EXPIRED")

        if int(challenge.get("attempts", 0)) >= int(challenge.get("maxAttempts", OTP_MAX_ATTEMPTS)):
            raise AppError("Too many incorrect attempts. Request a new OTP.", 429, "OTP_ATTEMPTS")

        if _hash_otp(code) != challenge.get("codeHash"):
            challenge["attempts"] = int(challenge.get("attempts", 0)) + 1
            _save(state)
            raise AppError("Incorrect OTP.", 400, "OTP_INVALID")

        challenge["status"] = "VERIFIED"
        user = _find_user_by_phone(state, phone)
        if user is None:
            user = _make_user(str(name or f"Member {phone[-4:]}"), phone)
            state["users"].append(user)
        elif name and str(name).strip() and str(user.get("name", "")).startswith("Member "):
            user["name"] = str(name).strip()
        if not user.get("isActive", True):
            raise AppError("This account is disabled.", 403, "ACCOUNT_DISABLED")

        token = secrets.token_urlsafe(32)
        session_expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat(
            timespec="seconds"
        ).replace("+00:00", "Z")
        state["sessions"].append({
            "token": token,
            "userId": user["id"],
            "createdAt": _now(),
            "expiresAt": session_expires,
            "revokedAt": None,
        })
        _save(state)
        return {"token": token, "tokenType": "Bearer", "expiresAt": session_expires, "user": public_user(user)}


def get_session_user(token: Any) -> dict[str, Any]:
    token = _require_text(token, "token")
    with _LOCK:
        state = _load()
        session = next((item for item in state["sessions"] if item.get("token") == token), None)
        if session is None or session.get("revokedAt"):
            raise AppError("Session not found or revoked.", 401, "UNAUTHORIZED")
        expires_at = datetime.fromisoformat(str(session.get("expiresAt", "")).replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            raise AppError("Session expired. Please sign in again.", 401, "UNAUTHORIZED")
        user = _find_user_by_id(state, str(session.get("userId")))
        if user is None or not user.get("isActive", True):
            raise AppError("Account is unavailable.", 401, "UNAUTHORIZED")
        return public_user(user)


def logout(token: Any) -> None:
    token = _require_text(token, "token")
    with _LOCK:
        state = _load()
        session = next((item for item in state["sessions"] if item.get("token") == token), None)
        if session and not session.get("revokedAt"):
            session["revokedAt"] = _now()
            _save(state)


# ---------------------------------------------------------------------------
# Users and member lookup
# ---------------------------------------------------------------------------
def list_users() -> list[dict[str, Any]]:
    with _LOCK:
        users = sorted(_load()["users"], key=lambda item: item.get("createdAt", ""), reverse=True)
        return [public_user(user) for user in users]


def create_user(full_name: Any, phone: Any, email: Any = None, ward: Any = None, role: Any = "RESIDENT") -> dict[str, Any]:
    full_name = _require_text(full_name, "fullName")
    phone = normalize_phone(phone)
    with _LOCK:
        state = _load()
        if _find_user_by_phone(state, phone):
            raise AppError("A member with this phone number already exists.", 409, "DUPLICATE_PHONE")
        user = _make_user(full_name, phone, role, ward, email)
        state["users"].append(user)
        _save(state)
        return public_user(user)


def update_user(user_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        state = _load()
        user = _find_user_by_id(state, user_id)
        if user is None:
            raise AppError("Member not found.", 404, "NOT_FOUND")
        for key in ("name", "ward", "panchayat", "district", "email"):
            if key in patch:
                user[key] = patch[key] or None
        if "isActive" in patch:
            user["isActive"] = bool(patch["isActive"])
        _save(state)
        return public_user(user)


def _invoice_view(invoice: dict[str, Any]) -> dict[str, Any]:
    """Expose both naming styles so one record works for every page."""
    return {
        **deepcopy(invoice),
        "status": str(invoice.get("status", "")).lower(),
        "invoice_no": invoice.get("invoiceNo"),
        "billing_month": invoice.get("billingMonth"),
        "amount_paise": invoice.get("amountPaise"),
        "due_date": invoice.get("dueDate"),
    }


def _payment_view(payment: dict[str, Any]) -> dict[str, Any]:
    return {
        **deepcopy(payment),
        "status": str(payment.get("status", "")).lower(),
        "paid_at": payment.get("paidAt"),
        "upi_ref": payment.get("upiRef"),
        "razorpay_payment_id": payment.get("razorpayPaymentId"),
        "receipt_no": payment.get("receiptNo"),
        "created_at": payment.get("createdAt"),
    }


def _invoice_rows(state: dict[str, Any], member_id: str) -> list[dict[str, Any]]:
    rows = [item for item in state["invoices"] if item.get("memberId") == member_id]
    rows.sort(key=lambda item: item.get("billingMonth", ""), reverse=True)
    return [_invoice_view(item) for item in rows]


def _payments_for_invoice(state: dict[str, Any], invoice_id: str) -> list[dict[str, Any]]:
    rows = [item for item in state["payments"] if item.get("invoiceId") == invoice_id]
    rows.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return [_payment_view(item) for item in rows]


def member_lookup(phone: Any) -> dict[str, Any]:
    phone = normalize_phone(phone)
    with _LOCK:
        state = _load()
        user = _find_user_by_phone(state, phone)
        if user is None:
            raise AppError("No member found for this phone number.", 404, "MEMBER_NOT_FOUND")
        invoices = []
        for invoice in _invoice_rows(state, user["id"]):
            payments = _payments_for_invoice(state, invoice["id"])
            paid_payment = next(
                (item for item in payments if str(item.get("status", "")).upper() == PAID), None
            )
            invoices.append({
                **invoice,
                "payments": payments,
                "paid_at": paid_payment.get("paidAt") if paid_payment else None,
                "receipt_no": paid_payment.get("receiptNo") if paid_payment else None,
                "payment_id": paid_payment.get("id") if paid_payment else None,
            })
        paid_payments = [
            item for invoice in invoices for item in invoice["payments"]
            if str(item.get("status", "")).upper() == PAID
        ]
        return {
            "member": public_user(user),
            "invoices": invoices,
            "summary": {
                "totalPaidPaise": sum(int(item.get("amountPaise", 0)) for item in paid_payments),
                "paidCount": len(paid_payments),
                "pendingCount": sum(
                    1 for invoice in invoices
                    if str(invoice.get("status", "")).upper() != PAID
                ),
                "invoiceCount": len(invoices),
                "pointsBalance": _balance_for(user["id"], state["points"]),
            },
        }


# ---------------------------------------------------------------------------
# Billing, payments and HKS worker collections
# ---------------------------------------------------------------------------
def generate_invoices(month: Any = None) -> dict[str, Any]:
    month = _require_text(month or _month(0), "month")
    if len(month) != 7 or month[4] != "-":
        raise AppError("Month must be in YYYY-MM format.", 400, "VALIDATION_ERROR")
    due_date = f"{month}-28"
    with _LOCK:
        state = _load()
        created = skipped = 0
        for user in state["users"]:
            if not user.get("isActive", True) or user.get("role") != "RESIDENT":
                continue
            if any(item.get("memberId") == user["id"] and item.get("billingMonth") == month for item in state["invoices"]):
                skipped += 1
                continue
            state["invoices"].append(_make_invoice(user, month))
            created += 1
        _save(state)
        return {"created": created, "skipped": skipped, "billingMonth": month, "dueDate": due_date}


def _award_for_payment(state: dict[str, Any], payment: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    reference = f"payment:{payment['id']}"
    if any(item.get("referenceId") == reference for item in state["points"]):
        return None
    return {
        "id": _new_id("pts"),
        "userId": user_id,
        "points": 50,
        "type": EARN,
        "reason": "Monthly HKS bill payment (₹50)",
        "referenceId": reference,
        "createdAt": _now(),
    }


def _settle_payment(state: dict[str, Any], payment: dict[str, Any], verified_by: str) -> dict[str, Any] | None:
    payment["status"] = PAID
    payment["paidAt"] = _now()
    payment["verifiedBy"] = verified_by
    payment["failureReason"] = None
    if not payment.get("receiptNo"):
        invoice = next((item for item in state["invoices"] if item.get("id") == payment.get("invoiceId")), None)
        month = invoice["billingMonth"] if invoice else _month(0)
        payment["receiptNo"] = f"RCT-{month}-{uuid.uuid4().hex[:4].upper()}"
    invoice = next((item for item in state["invoices"] if item.get("id") == payment.get("invoiceId")), None)
    if invoice:
        invoice["status"] = PAID
    points = _award_for_payment(state, payment, str(payment["memberId"]))
    if points:
        state["points"].append(points)
    return points


def record_payment(
    invoice_id: Any,
    method: Any,
    upi_ref: Any = None,
    collected_by: Any = None,
    reference: Any = None,
) -> dict[str, Any]:
    invoice_id = _require_text(invoice_id, "invoiceId")
    method = str(method or "upi").lower()
    if method not in ("upi", "cash", "razorpay"):
        raise AppError("Unsupported payment method.", 400, "VALIDATION_ERROR")
    if method == "razorpay":
        raise AppError("Razorpay is not configured in this demo. Use UPI or cash.", 503, "GATEWAY_UNAVAILABLE")

    with _LOCK:
        state = _load()
        invoice = next((item for item in state["invoices"] if item.get("id") == invoice_id), None)
        if invoice is None:
            raise AppError("Invoice not found.", 404, "NOT_FOUND")
        if invoice.get("status") == PAID:
            raise AppError("This invoice has already been paid.", 409, "ALREADY_PAID")
        member = _find_user_by_id(state, str(invoice["memberId"]))
        if member is None:
            raise AppError("Member not found.", 404, "NOT_FOUND")

        if method == "upi":
            upi_ref = _require_text(upi_ref, "UPI reference / UTR")
            payment = _make_payment(invoice, member, "upi", PENDING, upi_ref=upi_ref)
            points = None
        else:
            collected_by = _require_text(collected_by, "collectedBy")
            payment = _make_payment(invoice, member, "cash", PAID, collected_by=collected_by, reference=reference or None)
            points = _settle_payment(state, payment, collected_by)

        state["payments"].append(payment)
        _save(state)
        return {"payment": deepcopy(payment), "pointsAwarded": int(points["points"]) if points else 0}


def verify_payment(payment_id: Any, verified_by: Any = "admin") -> dict[str, Any]:
    payment_id = _require_text(payment_id, "paymentId")
    verified_by = _require_text(verified_by or "admin", "verifiedBy")
    with _LOCK:
        state = _load()
        payment = next((item for item in state["payments"] if item.get("id") == payment_id), None)
        if payment is None:
            raise AppError("Payment not found.", 404, "NOT_FOUND")
        if payment.get("status") == PAID:
            raise AppError("Payment is already verified.", 409, "ALREADY_VERIFIED")
        if payment.get("status") == REJECTED:
            raise AppError("Rejected payments cannot be verified.", 409, "PAYMENT_REJECTED")
        points = _settle_payment(state, payment, verified_by)
        _save(state)
        return {"payment": deepcopy(payment), "pointsAwarded": int(points["points"]) if points else 0}


def reject_payment(payment_id: Any, reason: Any = None) -> dict[str, Any]:
    payment_id = _require_text(payment_id, "paymentId")
    with _LOCK:
        state = _load()
        payment = next((item for item in state["payments"] if item.get("id") == payment_id), None)
        if payment is None:
            raise AppError("Payment not found.", 404, "NOT_FOUND")
        payment["status"] = REJECTED
        payment["failureReason"] = str(reason or "Manual payment could not be verified.").strip()
        _save(state)
        return deepcopy(payment)


def record_collection(phone: Any, collection_ref: Any, verified_by: Any = "HKS Worker", ward: Any = None) -> dict[str, Any]:
    phone = normalize_phone(phone)
    collection_ref = _require_text(collection_ref, "collectionReference")
    verified_by = _require_text(verified_by or "HKS Worker", "verifiedBy")
    with _LOCK:
        state = _load()
        member = _find_user_by_phone(state, phone)
        if member is None:
            raise AppError("No member found for this phone number.", 404, "MEMBER_NOT_FOUND")
        collection = {
            "id": _new_id("col"),
            "collectionId": collection_ref,
            "memberId": member["id"],
            "memberName": member["name"],
            "phone": member["phone"],
            "ward": ward or member.get("ward"),
            "status": "VERIFIED",
            "verifiedBy": verified_by,
            "createdAt": _now(),
        }
        state["collections"].append(collection)
        if any(
            item.get("referenceId") == collection_ref for item in state["points"]
        ):
            raise AppError("These points were already awarded for this collection.", 409, "DUPLICATE_REFERENCE")
        points = _add_points_entry(
            state,
            member["id"],
            20,
            "Clean plastic/waste segregation verified by HKS worker",
            collection_ref,
        )
        _save(state)
        return {"collection": deepcopy(collection), "pointsAwarded": points["points"]}


def list_invoices() -> list[dict[str, Any]]:
    with _LOCK:
        state = _load()
        users = {user["id"]: user for user in state["users"]}
        rows = []
        for invoice in sorted(state["invoices"], key=lambda item: item.get("billingMonth", ""), reverse=True):
            payments = _payments_for_invoice(state, invoice["id"])
            paid_payment = next(
                (item for item in payments if str(item.get("status", "")).upper() == PAID), None
            )
            member = users.get(invoice.get("memberId"), {})
            rows.append({
                **_invoice_view(invoice),
                "full_name": member.get("name", "Unknown"),
                "phone": member.get("phone", "—"),
                "payment_count": len(payments),
                "paid_at": paid_payment.get("paidAt") if paid_payment else None,
                "receipt_no": paid_payment.get("receiptNo") if paid_payment else None,
                "payment_id": paid_payment.get("id") if paid_payment else None,
            })
        return rows


def list_payments(status: str | None = None) -> list[dict[str, Any]]:
    with _LOCK:
        state = _load()
        users = {user["id"]: user for user in state["users"]}
        invoices = {invoice["id"]: invoice for invoice in state["invoices"]}
        rows = []
        for payment in sorted(state["payments"], key=lambda item: item.get("createdAt", ""), reverse=True):
            if status and str(payment.get("status", "")).upper() != str(status).upper():
                continue
            invoice = invoices.get(payment.get("invoiceId"), {})
            member = users.get(payment.get("memberId"), {})
            rows.append({
                **_payment_view(payment),
                "invoice_no": invoice.get("invoiceNo", "—"),
                "full_name": member.get("name", "Unknown"),
                "phone": member.get("phone", "—"),
            })
        return rows


def list_collections() -> list[dict[str, Any]]:
    with _LOCK:
        return deepcopy(sorted(_load()["collections"], key=lambda item: item.get("createdAt", ""), reverse=True))


def admin_overview() -> dict[str, Any]:
    with _LOCK:
        state = _load()
        paid = [item for item in state["payments"] if item.get("status") == PAID]
        current_month = _month(0)
        this_month = [item for item in paid if str(item.get("paidAt", "")).startswith(current_month)]
        return {
            "active_members": sum(1 for user in state["users"] if user.get("isActive", True)),
            "pending_invoices": sum(1 for invoice in state["invoices"] if invoice.get("status") != PAID),
            "collected_this_month_paise": sum(int(item.get("amountPaise", 0)) for item in this_month),
            "pending_verifications": sum(1 for item in state["payments"] if item.get("status") == PENDING),
            "total_paid_payments": len(paid),
            "total_collected_paise": sum(int(item.get("amountPaise", 0)) for item in paid),
            "total_green_points": sum(int(item.get("points", 0)) for item in state["points"]),
            "verified_collections": sum(1 for item in state["collections"] if item.get("status") == "VERIFIED"),
        }


def get_receipt(payment_id: Any) -> dict[str, Any]:
    payment_id = _require_text(payment_id, "paymentId")
    with _LOCK:
        state = _load()
        payment = next((item for item in state["payments"] if item.get("id") == payment_id), None)
        if payment is None or payment.get("status") != PAID:
            raise AppError("Receipt is available only for completed payments.", 404, "RECEIPT_NOT_FOUND")
        invoice = next((item for item in state["invoices"] if item.get("id") == payment.get("invoiceId")), None)
        member = _find_user_by_id(state, str(payment.get("memberId"))) or {}
        if invoice is None:
            raise AppError("Linked invoice not found.", 404, "RECEIPT_NOT_FOUND")
        month = invoice["billingMonth"]
        try:
            month_label = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
        except ValueError:
            month_label = month
        return {
            "id": payment["id"],
            "receipt_no": payment.get("receiptNo"),
            "invoice_no": invoice["invoiceNo"],
            "billing_month": month,
            "amount_paise": payment["amountPaise"],
            "method": payment["method"],
            "paid_at": payment.get("paidAt"),
            "due_date": invoice["dueDate"],
            "full_name": member.get("name", "Member"),
            "phone": member.get("phone", "—"),
            "email": member.get("email"),
            "ward": member.get("ward"),
            "razorpay_payment_id": payment.get("razorpayPaymentId"),
            "upi_ref": payment.get("upiRef"),
            "reference": payment.get("reference"),
            "collected_by": payment.get("collectedBy"),
            "verified_by": payment.get("verifiedBy"),
            "formattedAmount": f"₹{int(payment['amountPaise']) / 100:,.2f}",
            "amountWords": "Fifty rupees only",
            "monthLabel": month_label,
        }


# ---------------------------------------------------------------------------
# Green Points and rewards (shared with the rewards wallet)
# ---------------------------------------------------------------------------
def get_tier(balance: int) -> dict[str, Any]:
    if balance >= 500:
        return {"name": "Haritha Champion", "next": None, "pointsToNext": 0}
    if balance >= 200:
        return {"name": "Green Guardian", "next": "Haritha Champion", "pointsToNext": 500 - balance}
    return {"name": "Eco Starter", "next": "Green Guardian", "pointsToNext": 200 - balance}


def _balance_for(user_id: str, ledger: list[dict[str, Any]]) -> int:
    balance = 0
    for item in ledger:
        if item.get("userId") != user_id:
            continue
        points = int(item.get("points", 0))
        balance += points if item.get("type") == EARN else -abs(points)
    return balance


def _generate_coupon_code(coupons: list[dict[str, Any]]) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    existing = {item.get("couponCode") for item in coupons}
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if code not in existing:
            return code


def _add_points_entry(
    state: dict[str, Any], user_id: str, points: int, reason: str, reference_id: str
) -> dict[str, Any]:
    """Append a point entry to an already-loaded state (single atomic save)."""
    if any(item.get("referenceId") == reference_id for item in state["points"]):
        raise AppError("These points were already awarded for this reference.", 409, "DUPLICATE_REFERENCE")
    entry = {
        "id": _new_id("pts"),
        "userId": user_id,
        "points": points,
        "type": EARN,
        "reason": reason,
        "referenceId": reference_id,
        "createdAt": _now(),
    }
    state["points"].append(entry)
    return deepcopy(entry)


def add_green_points(user_id: Any, points: Any, reason: Any, reference_id: Any) -> dict[str, Any]:
    user_id = _require_text(user_id, "userId")
    points = _require_int(points, "points")
    reason = _require_text(reason, "reason")
    reference_id = _require_text(reference_id, "referenceId")
    with _LOCK:
        state = _load()
        entry = _add_points_entry(state, user_id, points, reason, reference_id)
        _save(state)
        return entry


def get_user_points_summary(user_id: Any) -> dict[str, Any]:
    user_id = _require_text(user_id, "userId")
    with _LOCK:
        ledger = [deepcopy(item) for item in _load()["points"] if item.get("userId") == user_id]
    ledger.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    balance = _balance_for(user_id, ledger)
    tier = get_tier(balance)
    return {
        "userId": user_id,
        "balance": balance,
        "tier": tier["name"],
        "tierProgress": tier,
        "transactions": ledger,
        "ledger": ledger,
    }


def get_user_coupons(user_id: Any) -> list[dict[str, Any]]:
    user_id = _require_text(user_id, "userId")
    with _LOCK:
        state = _load()
        vouchers = {item["id"]: item for item in state["vouchers"]}
        coupons = []
        for item in state["coupons"]:
            if item.get("userId") != user_id:
                continue
            voucher = vouchers.get(item.get("voucherId"), {})
            coupons.append({
                **deepcopy(item),
                "title": voucher.get("title", "Unknown voucher"),
                "description": voucher.get("description", ""),
                "expiryDate": voucher.get("expiryDate"),
                "discountValue": voucher.get("discountValue", 0),
            })
        coupons.sort(key=lambda item: item.get("redeemedAt", ""), reverse=True)
        return coupons


def redeem_voucher(user_id: Any, voucher_id: Any) -> dict[str, Any]:
    user_id = _require_text(user_id, "userId")
    voucher_id = _require_text(voucher_id, "voucherId")
    with _LOCK:
        state = _load()
        voucher = next((item for item in state["vouchers"] if item.get("id") == voucher_id), None)
        if voucher is None:
            raise AppError("Voucher not found.", 404, "VOUCHER_NOT_FOUND")
        cost = int(voucher.get("pointsRequired", 0))
        if int(voucher.get("stock", 0)) <= 0:
            raise AppError("This voucher is out of stock.", 409, "OUT_OF_STOCK")
        balance = _balance_for(user_id, state["points"])
        if balance < cost:
            raise AppError(
                f"Not enough Green Points. You need {cost}, you have {balance}.",
                409,
                "INSUFFICIENT_POINTS",
            )
        state["points"].append({
            "id": _new_id("pts"),
            "userId": user_id,
            "points": -cost,
            "type": REDEEM,
            "reason": f"Redeemed voucher: {voucher.get('title')}",
            "referenceId": f"redeem:{_new_id()}",
            "createdAt": _now(),
        })
        voucher["stock"] = int(voucher.get("stock", 0)) - 1
        coupon = {
            "id": _new_id("cpn"),
            "userId": user_id,
            "voucherId": voucher_id,
            "couponCode": _generate_coupon_code(state["coupons"]),
            "status": ACTIVE,
            "redeemedAt": _now(),
        }
        state["coupons"].append(coupon)
        _save(state)
        return {
            **deepcopy(coupon),
            "title": voucher.get("title"),
            "pointsSpent": cost,
            "remainingPoints": balance - cost,
        }


def award_payment(user_id: Any, bill_id: Any, amount: Any = None) -> dict[str, Any]:
    bill_id = _require_text(bill_id, "billId")
    if amount is not None:
        try:
            if float(amount) < 50:
                raise AppError("Only ₹50 or above monthly bills earn points.", 422, "INVALID_AMOUNT")
        except (TypeError, ValueError):
            raise AppError("amount must be a number.", 422, "INVALID_AMOUNT")
    return add_green_points(user_id, 50, "Monthly HKS bill payment (₹50)", bill_id)


def award_segregation(user_id: Any, collection_id: Any, verified: bool = True) -> dict[str, Any]:
    collection_id = _require_text(collection_id, "collectionId")
    if verified is not True:
        raise AppError("Segregation must be verified before awarding points.", 422, "NOT_VERIFIED")
    return add_green_points(user_id, 20, "Clean plastic/waste segregation verified by HKS worker", collection_id)


def mark_coupon_used(coupon_code: Any) -> dict[str, Any]:
    coupon_code = _require_text(coupon_code, "couponCode").upper()
    with _LOCK:
        state = _load()
        coupon = next((item for item in state["coupons"] if item.get("couponCode") == coupon_code), None)
        if coupon is None:
            raise AppError("Coupon not found.", 404, "COUPON_NOT_FOUND")
        coupon["status"] = USED
        _save(state)
        return deepcopy(coupon)


def demo_earn(user_id: Any, kind: Any) -> dict[str, Any]:
    """Shortcut buttons on the rewards page, backed by the same point ledger."""
    user_id = _require_text(user_id, "userId")
    kind = str(kind or "").lower()
    if kind == "payment":
        return award_payment(user_id, f"demo-bill:{uuid.uuid4().hex}", 50)
    if kind == "segregation":
        return award_segregation(user_id, f"demo-collection:{uuid.uuid4().hex}", True)
    raise AppError("Unknown demo earning type.", 400, "VALIDATION_ERROR")
