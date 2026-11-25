"""Tests for the shared identity, billing and rewards store."""

import tempfile
import unittest
from pathlib import Path

from src import hks_core as core


class UnifiedCoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        core.configure_data_file(Path(self.tmp.name) / "app_data.json")
        core.reset_state()
        core.ensure_seed_data()

    def member_token(self):
        core.request_otp(core.MEMBER_PHONE)
        return core.verify_otp(core.MEMBER_PHONE, core.DEMO_OTP)["token"]

    def admin_token(self):
        core.request_otp(core.ADMIN_PHONE, role="ADMIN")
        return core.verify_otp(core.ADMIN_PHONE, core.DEMO_OTP)["token"]

    def unpaid_invoice(self, phone=core.MEMBER_PHONE):
        data = core.member_lookup(phone)
        return next(row for row in data["invoices"] if row["status"] != "paid")

    # -- authentication ----------------------------------------------------
    def test_otp_login_session_and_logout(self):
        challenge = core.request_otp(core.MEMBER_PHONE)
        self.assertEqual(challenge["devCode"], core.DEMO_OTP)
        result = core.verify_otp(core.MEMBER_PHONE, core.DEMO_OTP)
        self.assertEqual(result["user"]["role"], "RESIDENT")
        self.assertEqual(core.get_session_user(result["token"])["phone"], core.MEMBER_PHONE)
        core.logout(result["token"])
        with self.assertRaises(core.AppError) as ctx:
            core.get_session_user(result["token"])
        self.assertEqual(ctx.exception.status, 401)

    def test_admin_login_is_restricted(self):
        with self.assertRaises(core.AppError) as ctx:
            core.request_otp(core.MEMBER_PHONE, role="ADMIN")
        self.assertEqual(ctx.exception.status, 403)
        admin = core.verify_otp(core.ADMIN_PHONE, self._admin_challenge())
        self.assertEqual(admin["user"]["role"], "ADMIN")

    def _admin_challenge(self):
        core.request_otp(core.ADMIN_PHONE, role="ADMIN")
        return core.DEMO_OTP

    def test_wrong_otp_can_be_retried(self):
        core.request_otp(core.MEMBER_PHONE)
        with self.assertRaises(core.AppError) as ctx:
            core.verify_otp(core.MEMBER_PHONE, "000000")
        self.assertEqual(ctx.exception.code, "OTP_INVALID")
        result = core.verify_otp(core.MEMBER_PHONE, core.DEMO_OTP)
        self.assertTrue(result["token"])

    # -- billing and points sync -------------------------------------------
    def test_upi_verification_pays_invoice_and_awards_points(self):
        invoice = self.unpaid_invoice()
        before = core.get_user_points_summary(invoice["memberId"])["balance"]
        payment = core.record_payment(invoice["id"], "upi", upi_ref="TESTUTR123")
        self.assertEqual(payment["payment"]["status"], "PENDING")
        self.assertEqual(payment["pointsAwarded"], 0)

        verified = core.verify_payment(payment["payment"]["id"], "test-admin")
        self.assertEqual(verified["payment"]["status"], "PAID")
        self.assertEqual(verified["pointsAwarded"], 50)
        self.assertTrue(verified["payment"]["receiptNo"])

        history = core.member_lookup(core.MEMBER_PHONE)
        paid = next(row for row in history["invoices"] if row["id"] == invoice["id"])
        self.assertEqual(paid["status"], "paid")
        self.assertEqual(paid["receipt_no"], verified["payment"]["receiptNo"])
        self.assertEqual(
            core.get_user_points_summary(invoice["memberId"])["balance"], before + 50
        )
        receipt = core.get_receipt(payment["payment"]["id"])
        self.assertEqual(receipt["amount_paise"], 5000)
        self.assertEqual(receipt["formattedAmount"], "₹50.00")

    def test_cash_payment_is_immediately_paid(self):
        invoice = self.unpaid_invoice()
        result = core.record_payment(invoice["id"], "cash", collected_by="Test Collector")
        self.assertEqual(result["payment"]["status"], "PAID")
        self.assertEqual(result["pointsAwarded"], 50)
        self.assertEqual(core.member_lookup(core.MEMBER_PHONE)["summary"]["paidCount"], 2)

    def test_collection_verification_awards_once(self):
        member = next(user for user in core.list_users() if user["phone"] == core.MEMBER_PHONE)
        before = core.get_user_points_summary(member["id"])["balance"]
        result = core.record_collection(core.MEMBER_PHONE, "COL-TEST-1")
        self.assertEqual(result["pointsAwarded"], 20)
        with self.assertRaises(core.AppError) as ctx:
            core.record_collection(core.MEMBER_PHONE, "COL-TEST-1")
        self.assertEqual(ctx.exception.code, "DUPLICATE_REFERENCE")
        self.assertEqual(core.get_user_points_summary(member["id"])["balance"], before + 20)

    def test_redeemed_points_reflect_in_member_summary(self):
        member = next(user for user in core.list_users() if user["phone"] == core.MEMBER_PHONE)
        before = core.member_lookup(core.MEMBER_PHONE)["summary"]["pointsBalance"]
        core.add_green_points(member["id"], 100, "test", "seed-points")
        voucher = core.get_vouchers()[0]
        result = core.redeem_voucher(member["id"], voucher["id"])
        self.assertEqual(len(result["couponCode"]), 8)
        summary = core.member_lookup(core.MEMBER_PHONE)["summary"]
        self.assertEqual(summary["pointsBalance"], before)


if __name__ == "__main__":
    unittest.main()
