"""Unified demo server for Haritha Karma Sena.

Serves the whole merged website from public/ and exposes:
  * the real Green Points / Rewards API (stdlib, JSON persistence)
  * lightweight demo responses for the billing/admin pages so the full site
    can be tested without Node.js or PostgreSQL installed.

Run: python server.py  then open http://localhost:8000
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src import rewards_core

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "8000"))


# ---------------------------------------------------------------------------
# Demo data for the billing / admin pages (no database required)
# ---------------------------------------------------------------------------
def _month(offset: int = 0) -> str:
    today = date.today()
    month = today.month - 1 + offset
    year = today.year + month // 12
    month = month % 12 + 1
    return f"{year:04d}-{month:02d}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


DEMO_MEMBERS = [
    {"id": "demo-member", "full_name": "Demo Member", "phone": "9999999999",
     "email": "demo@example.com", "ward": "Ward 5", "is_active": True},
    {"id": "demo-member-2", "full_name": "Anitha Nair", "phone": "8888888888",
     "email": "anitha@example.com", "ward": "Ward 4", "is_active": True},
    {"id": "demo-member-3", "full_name": "Raju Kumar", "phone": "7777777777",
     "email": None, "ward": "Ward 6", "is_active": True},
]

DEMO_PAYMENTS = [
    {
        "id": "demo-payment-paid", "invoice_id": "demo-invoice-paid",
        "amount_paise": 5000, "method": "upi", "status": "paid",
        "paid_at": f"{_month(-1)}-12T06:30:00Z", "receipt_no": f"RCT-{_month(-1)}-0001",
        "upi_ref": "DEMOUPI123456", "razorpay_payment_id": None,
        "collected_by": None, "verified_by": "admin", "failure_reason": None,
        "created_at": f"{_month(-1)}-12T06:00:00Z",
    },
    {
        "id": "demo-payment-pending", "invoice_id": "demo-invoice-pending",
        "amount_paise": 5000, "method": "cash", "status": "pending",
        "paid_at": None, "receipt_no": None, "upi_ref": None,
        "razorpay_payment_id": None, "collected_by": "HKS Worker",
        "verified_by": None, "failure_reason": None,
        "reference": "CASH-DEMO-1", "created_at": _now(),
    },
]


def _demo_invoices() -> list[dict]:
    paid_month, current_month = _month(-1), _month(0)
    due_current = f"{current_month}-28"
    return [
        {
            "id": "demo-invoice-paid", "invoice_no": f"HKS-{paid_month}-0001",
            "member_id": "demo-member", "billing_month": paid_month,
            "amount_paise": 5000, "due_date": f"{paid_month}-10", "status": "paid",
            "full_name": "Demo Member", "phone": "9999999999", "created_at": f"{paid_month}-01T00:00:00Z",
        },
        {
            "id": "demo-invoice-pending", "invoice_no": f"HKS-{current_month}-0001",
            "member_id": "demo-member", "billing_month": current_month,
            "amount_paise": 5000, "due_date": due_current, "status": "pending",
            "full_name": "Demo Member", "phone": "9999999999", "created_at": f"{current_month}-01T00:00:00Z",
        },
    ]


def _demo_month_label(value: str) -> str:
    try:
        return datetime.strptime(str(value)[:7], "%Y-%m").strftime("%B %Y")
    except ValueError:
        return str(value)


def _money(paise: int) -> str:
    return f"₹{int(paise or 0) / 100:,.2f}"


def _demo_receipt(payment: dict) -> dict:
    invoice = next(i for i in _demo_invoices() if i["id"] == payment["invoice_id"])
    return {
        "id": payment["id"], "receipt_no": payment["receipt_no"],
        "invoice_no": invoice["invoice_no"], "billing_month": invoice["billing_month"],
        "amount_paise": payment["amount_paise"], "method": payment["method"],
        "paid_at": payment["paid_at"], "due_date": invoice["due_date"],
        "full_name": "Demo Member", "phone": "9999999999",
        "email": "demo@example.com", "ward": "Ward 5",
        "razorpay_payment_id": payment.get("razorpay_payment_id"),
        "upi_ref": payment.get("upi_ref"), "reference": payment.get("reference"),
        "collected_by": payment.get("collected_by"), "verified_by": payment.get("verified_by"),
        "formattedAmount": _money(payment["amount_paise"]),
        "amountWords": "Five thousand paise only",
        "monthLabel": _demo_month_label(invoice["billing_month"]),
        "verificationUrl": f"http://localhost:{PORT}/receipt.html?id={payment['id']}",
    }


def _demo_qr_svg(label: str) -> bytes:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">'
        '<rect width="260" height="260" fill="#ffffff"/>'
        '<rect x="10" y="10" width="240" height="240" fill="none" stroke="#103c2e" stroke-width="4"/>'
        '<text x="130" y="112" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#103c2e">DEMO QR</text>'
        f'<text x="130" y="150" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#60746a">{label}</text>'
        "</svg>"
    )
    return svg.encode("utf-8")


class RewardsHandler(BaseHTTPRequestHandler):
    server_version = "HKSDemo/1.0"

    def _send(self, status: int, payload: object, content_type: str = "application/json; charset=utf-8") -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: object) -> None:
        self._send(status, payload)

    def _error(self, error: rewards_core.RewardsError) -> None:
        self._json(error.status, {"error": {"code": error.code, "message": error.message}})

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            raise rewards_core.RewardsError("Invalid JSON body.", status=400, code="INVALID_JSON")
        if not isinstance(data, dict):
            raise rewards_core.RewardsError("JSON body must be an object.", status=400, code="INVALID_JSON")
        return data

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        try:
            if path.startswith("/api/"):
                return self._handle_api_get(path, query)
            return self._serve_static(path)
        except rewards_core.RewardsError as exc:
            return self._error(exc)
        except Exception as exc:  # pragma: no cover - defensive
            return self._json(500, {"error": {"code": "SERVER_ERROR", "message": str(exc)}})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        try:
            data = self._body()
            if path.startswith("/api/rewards/") or path == "/api/rewards":
                return self._handle_rewards_post(path, data)
            return self._handle_demo_post(path, data)
        except rewards_core.RewardsError as exc:
            return self._error(exc)
        except Exception as exc:  # pragma: no cover - defensive
            return self._json(500, {"error": {"code": "SERVER_ERROR", "message": str(exc)}})

    # ----- Rewards API (real logic) ----------------------------------------
    def _handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        one = lambda key: (query.get(key) or [""])[0]

        if path == "/api/rewards/summary":
            return self._json(200, rewards_core.get_user_points_summary(one("userId")))
        if path == "/api/rewards/vouchers":
            return self._json(200, {"vouchers": rewards_core.get_vouchers()})
        if path == "/api/rewards/coupons":
            return self._json(200, {"coupons": rewards_core.get_user_coupons(one("userId"))})
        if path == "/api/rewards/health":
            return self._json(200, {"status": "ok"})

        # ----- Demo billing / admin API -----------------------------------
        if path == "/api/health":
            return self._json(200, {
                "ok": True, "db": "demo mode (no database)", "razorpayConfigured": False,
                "upiId": "hksdemo@upi", "monthlyFeePaise": 5000,
                "currency": "INR", "serverTime": _now(),
            })
        if path == "/api/config":
            return self._json(200, {
                "appUrl": f"http://localhost:{PORT}", "monthlyFeePaise": 5000,
                "currency": "INR", "razorpayConfigured": False, "razorpayKeyId": "",
                "upiId": "hksdemo@upi", "upiName": "Haritha Karma Sena",
            })
        if path in ("/api/members/lookup", "/api/history"):
            phone = one("phone") or "9999999999"
            member = dict(DEMO_MEMBERS[0])
            member["phone"] = phone
            invoices = []
            for invoice in _demo_invoices():
                invoices.append({
                    **invoice,
                    "monthLabel": _demo_month_label(invoice["billing_month"]),
                    "formattedAmount": _money(invoice["amount_paise"]),
                    "payments": [dict(p) for p in DEMO_PAYMENTS if p["invoice_id"] == invoice["id"]],
                })
            paid = [p for inv in invoices for p in inv["payments"] if p["status"] == "paid"]
            return self._json(200, {
                "member": member, "invoices": invoices,
                "summary": {
                    "totalPaidPaise": sum(int(p["amount_paise"]) for p in paid),
                    "paidCount": len(paid),
                    "pendingCount": sum(1 for inv in invoices if inv["status"] != "paid"),
                    "invoiceCount": len(invoices),
                },
            })
        if path == "/api/payments/upi/qr":
            return self._send(200, _demo_qr_svg("hksdemo@upi"), "image/svg+xml")
        if path.startswith("/api/receipts/"):
            parts = path.split("/")
            payment_id = parts[3] if len(parts) > 3 else ""
            payment = next((p for p in DEMO_PAYMENTS if p["id"] == payment_id and p["status"] == "paid"), None)
            if payment is None:
                return self._json(404, {"error": "Receipt is available only for completed payments."})
            if len(parts) > 4 and parts[4] == "qr":
                return self._send(200, _demo_qr_svg(payment["receipt_no"]), "image/svg+xml")
            return self._json(200, _demo_receipt(payment))
        if path.startswith("/api/admin/"):
            return self._handle_demo_admin_get(path, query)

        return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Unknown endpoint."}})

    def _handle_rewards_post(self, path: str, data: dict) -> None:
        if path == "/api/rewards/redeem":
            return self._json(201, rewards_core.redeem_voucher(data.get("userId"), data.get("voucherId")))
        if path == "/api/rewards/award-payment":
            return self._json(201, rewards_core.award_payment(
                data.get("userId"), data.get("billId"), data.get("amount")))
        if path == "/api/rewards/award-segregation":
            return self._json(201, rewards_core.award_segregation(
                data.get("userId"), data.get("collectionId"), data.get("verified", True)))
        if path == "/api/rewards/seed":
            return self._json(200, {"vouchers": rewards_core.seed_default_vouchers()})
        return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Unknown endpoint."}})

    # ----- Demo billing / admin POST --------------------------------------
    def _handle_demo_post(self, path: str, data: dict) -> None:
        if path == "/api/payments/upi":
            ref = str(data.get("upiRef") or "").strip()
            if not ref:
                return self._json(400, {"error": "UPI transaction reference / UTR is required."})
            return self._json(200, {
                "ok": True, "paymentId": f"demo-upi-{uuid.uuid4().hex[:8]}", "status": "pending",
                "message": "Demo: UPI reference submitted. An admin will verify it and issue your receipt shortly.",
                "upiLink": "upi://pay?pa=hksdemo@upi&pn=Haritha%20Karma%20Sena&am=50.00&cu=INR",
            })
        if path == "/api/payments/razorpay/order":
            return self._json(503, {"error": "Razorpay is not configured in demo mode. Use UPI or cash instead."})
        if path == "/api/payments/cash":
            collector = str(data.get("collectedBy") or "").strip()
            if not collector:
                return self._json(400, {"error": "collectedBy is required for cash payments."})
            payment = {
                "id": f"demo-payment-{uuid.uuid4().hex[:8]}", "invoice_id": "demo-invoice-pending",
                "amount_paise": 5000, "method": "cash", "status": "paid", "paid_at": _now(),
                "receipt_no": f"RCT-{_month(0)}-{uuid.uuid4().hex[:4].upper()}",
                "upi_ref": None, "razorpay_payment_id": None, "collected_by": collector,
                "verified_by": "admin", "failure_reason": None, "created_at": _now(),
            }
            DEMO_PAYMENTS.append(payment)
            return self._json(200, {"ok": True, "receiptNo": payment["receipt_no"],
                                    "receiptUrl": f"/receipt.html?id={payment['id']}"})
        if path == "/api/admin/invoices/generate":
            return self._json(200, {
                "ok": True, "created": 3, "skipped": 0,
                "billingMonth": str(data.get("month") or _month(0)),
                "dueDate": f"{_month(0)}-28",
            })
        if path == "/api/admin/members":
            name, phone = str(data.get("fullName") or "").strip(), str(data.get("phone") or "").strip()
            if not name or not phone:
                return self._json(400, {"error": "fullName and phone are required."})
            member = {"id": f"demo-member-{uuid.uuid4().hex[:8]}", "full_name": name, "phone": phone,
                      "email": data.get("email") or None, "ward": data.get("ward") or None,
                      "is_active": True}
            DEMO_MEMBERS.append(member)
            return self._json(201, {"ok": True, "member": member})
        if path.startswith("/api/admin/payments/"):
            parts = path.split("/")
            payment_id = parts[4] if len(parts) > 4 else ""
            action = parts[5] if len(parts) > 5 else ""
            payment = next((p for p in DEMO_PAYMENTS if p["id"] == payment_id), None)
            if payment is None:
                return self._json(404, {"error": "Payment not found."})
            if action == "verify":
                if payment["status"] == "paid":
                    return self._json(409, {"error": "Payment is already verified."})
                payment["status"] = "paid"
                payment["paid_at"] = _now()
                payment["receipt_no"] = f"RCT-{_month(0)}-{uuid.uuid4().hex[:4].upper()}"
                return self._json(200, {"ok": True, "receiptNo": payment["receipt_no"],
                                        "receiptUrl": f"/receipt.html?id={payment['id']}"})
            if action == "reject":
                payment["status"] = "rejected"
                payment["failure_reason"] = str(data.get("reason") or "Manual payment could not be verified.")
                return self._json(200, {"ok": True, "status": "rejected"})
        return self._json(404, {"error": "Unknown endpoint."})

    def _handle_demo_admin_get(self, path: str, query: dict[str, list[str]]) -> None:
        if path == "/api/admin/overview":
            paid = [p for p in DEMO_PAYMENTS if p["status"] == "paid"]
            this_month = [p for p in paid if str(p.get("paid_at", "")).startswith(_month(0))]
            return self._json(200, {
                "active_members": len(DEMO_MEMBERS),
                "pending_invoices": sum(1 for i in _demo_invoices() if i["status"] != "paid"),
                "collected_this_month_paise": sum(int(p["amount_paise"]) for p in this_month) or 5000,
                "pending_verifications": sum(1 for p in DEMO_PAYMENTS if p["status"] == "pending"),
                "total_paid_payments": len(paid),
                "total_collected_paise": sum(int(p["amount_paise"]) for p in paid),
            })
        if path == "/api/admin/members":
            rows = []
            for m in DEMO_MEMBERS:
                invoices = _demo_invoices()
                rows.append({**m, "invoice_count": len(invoices),
                             "paid_count": sum(1 for i in invoices if i["status"] == "paid"),
                             "created_at": f"{_month(-1)}-01T00:00:00Z"})
            return self._json(200, {"members": rows})
        if path == "/api/admin/invoices":
            rows = []
            for invoice in _demo_invoices():
                payments = [p for p in DEMO_PAYMENTS if p["invoice_id"] == invoice["id"]]
                paid_payment = next((p for p in payments if p["status"] == "paid"), None)
                rows.append({
                    **invoice,
                    "payment_count": len(payments),
                    "paid_at": paid_payment["paid_at"] if paid_payment else None,
                    "receipt_no": paid_payment["receipt_no"] if paid_payment else None,
                    "payment_id": paid_payment["id"] if paid_payment else None,
                })
            return self._json(200, {"invoices": rows})
        if path == "/api/admin/payments":
            status = (query.get("status") or [""])[0]
            rows = []
            for payment in DEMO_PAYMENTS:
                if status and payment["status"] != status:
                    continue
                invoice = next(i for i in _demo_invoices() if i["id"] == payment["invoice_id"])
                rows.append({**payment, "invoice_no": invoice["invoice_no"],
                             "full_name": invoice["full_name"], "phone": invoice["phone"]})
            return self._json(200, {"payments": rows})
        return self._json(404, {"error": "Unknown endpoint."})

    def _serve_static(self, path: str) -> None:
        if path == "/":
            target = PUBLIC / "index.html"
        else:
            target = (PUBLIC / path.lstrip("/")).resolve()
            if not target.suffix:
                target = target.with_suffix(".html")
            if PUBLIC.resolve() not in target.parents and target != PUBLIC.resolve():
                return self._json(403, {"error": {"code": "FORBIDDEN", "message": "Forbidden."}})
        if not target.is_file():
            return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Not found."}})
        suffixes = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        self._send(200, target.read_bytes(), suffixes.get(target.suffix, "application/octet-stream"))

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[demo] {self.address_string()} - {fmt % args}")


def main() -> None:
    rewards_core.seed_default_vouchers()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), RewardsHandler)
    print(f"Haritha Karma Sena demo running at http://localhost:{PORT}")
    print("Pages: / (billing), /pay.html, /history.html, /admin.html, /receipt.html, /rewards.html")
    print("Demo mode: billing/admin APIs return sample data; Rewards API uses data/rewards_data.json")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
