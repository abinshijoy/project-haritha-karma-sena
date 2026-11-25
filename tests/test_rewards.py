"""Standard-library tests for the rewards core logic."""

import tempfile
import unittest
from pathlib import Path

from src import rewards_core


class RewardsCoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        rewards_core.configure_data_file(Path(self.tmp.name) / "data.json")
        rewards_core.reset_state()

    def test_add_points_and_duplicate_reference_protection(self):
        tx = rewards_core.add_green_points("u1", 50, "bill paid", "bill-1")
        self.assertEqual(tx["type"], "EARN")
        self.assertEqual(tx["points"], 50)
        with self.assertRaises(rewards_core.RewardsError) as ctx:
            rewards_core.add_green_points("u1", 50, "bill paid again", "bill-1")
        self.assertEqual(ctx.exception.code, "DUPLICATE_REFERENCE")

    def test_summary_balance_history_and_tiers(self):
        rewards_core.add_green_points("u1", 50, "bill", "b1")
        rewards_core.add_green_points("u1", 20, "segregation", "c1")
        summary = rewards_core.get_user_points_summary("u1")
        self.assertEqual(summary["balance"], 70)
        self.assertEqual(summary["tier"], "Eco Starter")
        self.assertEqual(summary["tierProgress"]["pointsToNext"], 130)
        self.assertEqual(len(summary["transactions"]), 2)

        rewards_core.add_green_points("u1", 200, "event", "e1")
        summary = rewards_core.get_user_points_summary("u1")
        self.assertEqual(summary["tier"], "Green Guardian")

    def test_seed_vouchers_is_idempotent(self):
        first = rewards_core.seed_default_vouchers()
        second = rewards_core.seed_default_vouchers()
        self.assertEqual(len(first), 4)
        self.assertEqual(len(second), 4)
        self.assertEqual({v["title"] for v in first}, {v["title"] for v in second})

    def test_redeem_voucher_success(self):
        rewards_core.seed_default_vouchers()
        voucher = rewards_core.get_vouchers()[0]
        rewards_core.add_green_points("u1", 100, "segregation", "c1")

        result = rewards_core.redeem_voucher("u1", voucher["id"])
        self.assertEqual(len(result["couponCode"]), 8)
        self.assertTrue(result["couponCode"].isupper())
        self.assertEqual(result["remainingPoints"], 0)
        self.assertEqual(result["status"], "ACTIVE")

        updated = next(v for v in rewards_core.get_vouchers() if v["id"] == voucher["id"])
        self.assertEqual(updated["stock"], voucher["stock"] - 1)
        summary = rewards_core.get_user_points_summary("u1")
        self.assertEqual(summary["balance"], 0)
        self.assertEqual(summary["transactions"][0]["type"], "REDEEM")

    def test_redeem_fails_without_enough_points_or_stock(self):
        rewards_core.seed_default_vouchers()
        voucher = rewards_core.get_vouchers()[0]
        with self.assertRaises(rewards_core.RewardsError) as ctx:
            rewards_core.redeem_voucher("u1", voucher["id"])
        self.assertEqual(ctx.exception.code, "INSUFFICIENT_POINTS")

        rewards_core.add_green_points("u1", 500, "bonus", "b1")
        state_path = rewards_core.DATA_FILE
        import json

        state = json.loads(state_path.read_text(encoding="utf-8"))
        for item in state["vouchers"]:
            if item["id"] == voucher["id"]:
                item["stock"] = 0
        state_path.write_text(json.dumps(state), encoding="utf-8")

        with self.assertRaises(rewards_core.RewardsError) as ctx:
            rewards_core.redeem_voucher("u1", voucher["id"])
        self.assertEqual(ctx.exception.code, "OUT_OF_STOCK")

    def test_member_integration_awards(self):
        payment = rewards_core.award_payment("u1", "bill-42", 50)
        self.assertEqual(payment["points"], 50)
        segregation = rewards_core.award_segregation("u1", "collection-7", True)
        self.assertEqual(segregation["points"], 20)

        with self.assertRaises(rewards_core.RewardsError) as ctx:
            rewards_core.award_payment("u2", "bill-42", 50)
        self.assertEqual(ctx.exception.code, "DUPLICATE_REFERENCE")

        with self.assertRaises(rewards_core.RewardsError) as ctx:
            rewards_core.award_segregation("u2", "collection-8", False)
        self.assertEqual(ctx.exception.code, "NOT_VERIFIED")

    def test_coupons_and_mark_used(self):
        rewards_core.seed_default_vouchers()
        voucher = rewards_core.get_vouchers()[0]
        rewards_core.add_green_points("u1", 100, "bill", "b1")
        coupon = rewards_core.redeem_voucher("u1", voucher["id"])
        coupons = rewards_core.get_user_coupons("u1")
        self.assertEqual(len(coupons), 1)
        self.assertEqual(coupons[0]["couponCode"], coupon["couponCode"])

        used = rewards_core.mark_coupon_used(coupon["couponCode"])
        self.assertEqual(used["status"], "USED")
        self.assertEqual(rewards_core.get_user_coupons("u1")[0]["status"], "USED")


if __name__ == "__main__":
    unittest.main()
