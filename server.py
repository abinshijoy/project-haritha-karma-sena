"""Unified demo server for Haritha Karma Sena.

One Python process serves the complete website and one API. The member portal,
admin/HKS console, billing and Green Points all use :mod:`src.hks_core` so every
action is reflected everywhere immediately.

Run: python server.py   then open http://localhost:8000
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src import hks_core as core

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "8000"))

_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _qr_svg(label: str) -> bytes:
    """A simple, dependency-free demo QR-style graphic."""
    safe = (
        str(label)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">'
        '<rect width="260" height="260" rx="18" fill="#fffdf8"/>'
        '<rect x="12" y="12" width="236" height="236" rx="12" fill="none" stroke="#4c1d95" stroke-width="5"/>'
        '<rect x="34" y="34" width="52" height="52" rx="8" fill="#4c1d95"/>'
        '<rect x="174" y="34" width="52" height="52" rx="8" fill="#f97316"/>'
        '<rect x="34" y="174" width="52" height="52" rx="8" fill="#0f766e"/>'
        '<text x="130" y="126" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#2e1065">DEMO QR</text>'
        f'<text x="130" y="154" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6d28d9">{safe}</text>'
        "</svg>"
    ).encode("utf-8")


class UnifiedHandler(BaseHTTPRequestHandler):
    server_version = "HKSUnified/2.0"

    # ----- transport helpers -----------------------------------------------
    def _send(
        self,
        status: int,
        payload: object,
        content_type: str = "application/json; charset=utf-8",
        cache_control: str = "no-store",
    ) -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload: object) -> None:
        self._send(status, payload)

    def _ok(self, payload: object, status: int = 200) -> None:
        self._json(status, {"success": True, "data": payload})

    def _error(self, error: core.AppError) -> None:
        self._json(error.status, {"success": False, "error": {"code": error.code, "message": error.message}})

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            raise core.AppError("Invalid JSON body.", 400, "INVALID_JSON")
        if not isinstance(data, dict):
            raise core.AppError("JSON body must be an object.", 400, "INVALID_JSON")
        return data

    def _token(self) -> str | None:
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:].strip()
            return token or None
        return None

    def _require_user(self) -> dict:
        return core.get_session_user(self._token())

    def _require_admin(self) -> dict:
        user = self._require_user()
        if user.get("role") != "ADMIN":
            raise core.AppError("Admin access is required.", 403, "FORBIDDEN")
        return user

    def _lookup_phone(self, query: dict[str, list[str]]) -> str:
        user = self._require_user()
        requested = (query.get("phone") or [user["phone"]])[0]
        phone = core.normalize_phone(requested)
        if user.get("role") != "ADMIN" and phone != user["phone"]:
            raise core.AppError("You can only view your own billing records.", 403, "FORBIDDEN")
        return phone

    def _rewards_user_id(self, query: dict[str, list[str]]) -> str:
        user = self._require_user()
        requested = (query.get("userId") or [user["id"]])[0]
        if requested == user["id"]:
            return user["id"]
        if user.get("role") != "ADMIN":
            raise core.AppError("You can only view your own Green Points.", 403, "FORBIDDEN")
        if not any(row["id"] == requested for row in core.list_users()):
            raise core.AppError("Member not found.", 404, "NOT_FOUND")
        return requested

    def _target_user_id(self, data: dict, user: dict) -> str:
        requested = data.get("userId")
        if not requested or requested == user["id"]:
            return user["id"]
        if user.get("role") != "ADMIN":
            raise core.AppError("You can only update your own Green Points.", 403, "FORBIDDEN")
        if not any(row["id"] == requested for row in core.list_users()):
            raise core.AppError("Member not found.", 404, "NOT_FOUND")
        return requested

    # ----- HTTP verbs -------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        try:
            if path.startswith("/api/"):
                self._handle_get_api(path, query)
            else:
                self._serve_static(path)
        except core.AppError as exc:
            self._error(exc)
        except Exception as exc:  # pragma: no cover - defensive
            self._json(500, {"success": False, "error": {"code": "SERVER_ERROR", "message": str(exc)}})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        try:
            data = self._body()
            self._handle_post_api(path, data)
        except core.AppError as exc:
            self._error(exc)
        except Exception as exc:  # pragma: no cover - defensive
            self._json(500, {"success": False, "error": {"code": "SERVER_ERROR", "message": str(exc)}})

    # ----- GET API ----------------------------------------------------------
    def _handle_get_api(self, path: str, query: dict[str, list[str]]) -> None:
        one = lambda key: (query.get(key) or [""])[0]

        if path == "/api/health":
            return self._ok({
                "ok": True,
                "db": "unified JSON demo store",
                "razorpayConfigured": False,
                "upiId": "hksdemo@upi",
                "monthlyFeePaise": core.MONTHLY_FEE_PAISE,
                "currency": "INR",
                "serverTime": _now(),
            })
        if path == "/api/config":
            return self._ok({
                "appUrl": f"http://localhost:{PORT}",
                "monthlyFeePaise": core.MONTHLY_FEE_PAISE,
                "currency": "INR",
                "razorpayConfigured": False,
                "razorpayKeyId": "",
                "upiId": "hksdemo@upi",
                "upiName": "Haritha Karma Sena",
                "demoOtp": core.DEMO_OTP,
            })
        if path == "/api/auth/me":
            return self._ok({"user": self._require_user()})
        if path in ("/api/history", "/api/members/lookup"):
            return self._ok(core.member_lookup(self._lookup_phone(query)))
        if path == "/api/payments/upi/qr":
            return self._send(200, _qr_svg(one("invoiceId") or "hksdemo@upi"), "image/svg+xml")

        if path.startswith("/api/receipts/"):
            parts = path.split("/")
            payment_id = parts[3] if len(parts) > 3 else ""
            receipt = core.get_receipt(payment_id)
            if len(parts) > 4 and parts[4] == "qr":
                return self._send(200, _qr_svg(receipt["receipt_no"] or payment_id), "image/svg+xml")
            return self._ok(receipt)

        if path == "/api/rewards/health":
            return self._ok({"status": "ok", "store": "shared"})
        if path == "/api/rewards/summary":
            return self._ok(core.get_user_points_summary(self._rewards_user_id(query)))
        if path == "/api/rewards/vouchers":
            self._require_user()
            return self._ok({"vouchers": core.get_vouchers()})
        if path == "/api/rewards/coupons":
            return self._ok({"coupons": core.get_user_coupons(self._rewards_user_id(query))})

        if path.startswith("/api/admin/"):
            self._require_admin()
            if path == "/api/admin/overview":
                return self._ok(core.admin_overview())
            if path == "/api/admin/members":
                return self._ok({"members": core.list_users()})
            if path == "/api/admin/invoices":
                return self._ok({"invoices": core.list_invoices()})
            if path == "/api/admin/payments":
                return self._ok({"payments": core.list_payments(one("status") or None)})
            if path == "/api/admin/collections":
                return self._ok({"collections": core.list_collections()})
            raise core.AppError("Unknown admin endpoint.", 404, "NOT_FOUND")

        raise core.AppError("Unknown endpoint.", 404, "NOT_FOUND")

    # ----- POST API ---------------------------------------------------------
    def _handle_post_api(self, path: str, data: dict) -> None:
        if path == "/api/auth/request-otp":
            return self._ok(core.request_otp(data.get("phone"), data.get("name"), data.get("role", "RESIDENT")), 201)
        if path == "/api/auth/verify-otp":
            return self._ok(core.verify_otp(data.get("phone"), data.get("code"), data.get("name")))
        if path == "/api/auth/logout":
            core.logout(self._token())
            return self._ok({"message": "Signed out."})

        if path.startswith("/api/rewards/") or path == "/api/rewards":
            if path == "/api/rewards/health":
                return self._ok({"status": "ok", "store": "shared"})
            user = self._require_user()
            if path == "/api/rewards/redeem":
                return self._ok(core.redeem_voucher(user["id"], data.get("voucherId")), 201)
            if path == "/api/rewards/seed":
                return self._ok({"vouchers": core.seed_default_vouchers()})
            target = self._target_user_id(data, user)
            if path == "/api/rewards/award-payment":
                return self._ok(core.award_payment(target, data.get("billId"), data.get("amount")), 201)
            if path == "/api/rewards/award-segregation":
                return self._ok(
                    core.award_segregation(target, data.get("collectionId"), data.get("verified", True)), 201
                )
            raise core.AppError("Unknown rewards endpoint.", 404, "NOT_FOUND")

        if path in ("/api/demo/earn-payment", "/api/demo/earn-segregation"):
            user = self._require_user()
            kind = "payment" if path.endswith("payment") else "segregation"
            return self._ok(core.demo_earn(user["id"], kind), 201)

        if path == "/api/payments/upi":
            user = self._require_user()
            self._assert_invoice_owner(data.get("invoiceId"), user)
            result = core.record_payment(
                data.get("invoiceId"), "upi", upi_ref=data.get("upiRef"), reference=data.get("reference")
            )
            return self._ok({
                "ok": True,
                "paymentId": result["payment"]["id"],
                "status": result["payment"]["status"],
                "message": "UPI reference submitted. An admin will verify it and issue your receipt shortly.",
                "upiLink": "upi://pay?pa=hksdemo@upi&pn=Haritha%20Karma%20Sena&am=50.00&cu=INR",
                "pointsAwarded": result["pointsAwarded"],
            })
        if path == "/api/payments/cash":
            self._require_admin()
            result = core.record_payment(
                data.get("invoiceId"),
                "cash",
                collected_by=data.get("collectedBy"),
                reference=data.get("reference"),
            )
            return self._ok({
                "ok": True,
                "receiptNo": result["payment"]["receiptNo"],
                "receiptUrl": f"/receipt.html?id={result['payment']['id']}",
                "pointsAwarded": result["pointsAwarded"],
            })
        if path == "/api/payments/razorpay/order":
            self._require_user()
            raise core.AppError("Razorpay is not configured in demo mode. Use UPI or cash instead.", 503, "GATEWAY_UNAVAILABLE")

        if path.startswith("/api/admin/"):
            self._require_admin()
            if path == "/api/admin/invoices/generate":
                return self._ok(core.generate_invoices(data.get("month")))
            if path == "/api/admin/members":
                member = core.create_user(
                    data.get("fullName"), data.get("phone"), data.get("email"), data.get("ward"), "RESIDENT"
                )
                return self._ok({"ok": True, "member": member}, 201)
            if path == "/api/admin/collections/verify":
                result = core.record_collection(
                    data.get("phone"),
                    data.get("collectionReference"),
                    data.get("verifiedBy") or "HKS Worker",
                    data.get("ward"),
                )
                return self._ok(result, 201)
            parts = path.split("/")
            if len(parts) >= 6 and parts[3] == "payments":
                payment_id, action = parts[4], parts[5]
                if action == "verify":
                    return self._ok(core.verify_payment(payment_id, data.get("verifiedBy") or "admin"))
                if action == "reject":
                    return self._ok({"payment": core.reject_payment(payment_id, data.get("reason"))})
            raise core.AppError("Unknown admin endpoint.", 404, "NOT_FOUND")

        raise core.AppError("Unknown endpoint.", 404, "NOT_FOUND")

    def _assert_invoice_owner(self, invoice_id: object, user: dict) -> None:
        if user.get("role") == "ADMIN":
            return
        invoice = next((row for row in core.list_invoices() if row.get("id") == invoice_id), None)
        if invoice is None:
            raise core.AppError("Invoice not found.", 404, "NOT_FOUND")
        if invoice.get("memberId") != user["id"]:
            raise core.AppError("You can only pay your own invoices.", 403, "FORBIDDEN")

    # ----- static files -----------------------------------------------------
    def _serve_static(self, path: str) -> None:
        if path == "/":
            target = PUBLIC / "index.html"
        else:
            target = (PUBLIC / path.lstrip("/")).resolve()
            if not target.suffix:
                target = target.with_suffix(".html")
            public_root = PUBLIC.resolve()
            if public_root not in target.parents and target != public_root:
                raise core.AppError("Forbidden.", 403, "FORBIDDEN")
        if not target.is_file():
            raise core.AppError("Not found.", 404, "NOT_FOUND")
        self._send(
            200,
            target.read_bytes(),
            _CONTENT_TYPES.get(target.suffix, "application/octet-stream"),
            cache_control="no-cache",
        )

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[hks] {self.address_string()} - {fmt % args}")


def main() -> None:
    core.ensure_seed_data()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), UnifiedHandler)
    print(f"Haritha Karma Sena unified app running at http://localhost:{PORT}")
    print("Demo OTP: 123456  |  Member: 9999999999  |  Admin: 9999999998")
    print("One shared store: data/app_data.json (users, bills, payments, points, vouchers)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
