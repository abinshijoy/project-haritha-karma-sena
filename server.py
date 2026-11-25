"""Tiny stdlib HTTP server exposing the Haritha Karma Sena rewards API and UI."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src import rewards_core

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "8000"))


class RewardsHandler(BaseHTTPRequestHandler):
    server_version = "HKSRewards/1.0"

    def _send(self, status: int, payload: object, content_type: str = "application/json; charset=utf-8") -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw)
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
        return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Unknown endpoint."}})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        try:
            data = self._body()
            if path == "/api/rewards/redeem":
                result = rewards_core.redeem_voucher(data.get("userId"), data.get("voucherId"))
                return self._json(201, result)
            if path == "/api/rewards/award-payment":
                result = rewards_core.award_payment(
                    data.get("userId"), data.get("billId"), data.get("amount")
                )
                return self._json(201, result)
            if path == "/api/rewards/award-segregation":
                result = rewards_core.award_segregation(
                    data.get("userId"), data.get("collectionId"), data.get("verified", True)
                )
                return self._json(201, result)
            if path == "/api/rewards/seed":
                return self._json(200, {"vouchers": rewards_core.seed_default_vouchers()})
            return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Unknown endpoint."}})
        except rewards_core.RewardsError as exc:
            return self._error(exc)
        except Exception as exc:  # pragma: no cover - defensive
            return self._json(500, {"error": {"code": "SERVER_ERROR", "message": str(exc)}})

    def _serve_static(self, path: str) -> None:
        if path == "/":
            target = PUBLIC / "index.html"
        else:
            target = (PUBLIC / path.lstrip("/")).resolve()
            if PUBLIC.resolve() not in target.parents and target != PUBLIC.resolve():
                return self._json(403, {"error": {"code": "FORBIDDEN", "message": "Forbidden."}})
        if not target.is_file():
            return self._json(404, {"error": {"code": "NOT_FOUND", "message": "Not found."}})
        suffixes = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
        }
        content_type = suffixes.get(target.suffix, "application/octet-stream")
        self._send(200, target.read_bytes(), content_type)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[rewards] {self.address_string()} - {fmt % args}")


def main() -> None:
    rewards_core.seed_default_vouchers()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), RewardsHandler)
    print(f"HKS Rewards server running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
