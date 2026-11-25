"""Compatibility layer for the original Green Points module.

The canonical implementation now lives in :mod:`src.hks_core` so the rewards
wallet, billing and admin console all read and write the same store. These
re-exports keep the original Member 5 tests and integrations working.
"""

from __future__ import annotations

from typing import Any

from . import hks_core

RewardsError = hks_core.AppError
EARN = hks_core.EARN
REDEEM = hks_core.REDEEM
ACTIVE = hks_core.ACTIVE
USED = hks_core.USED
DATA_FILE = hks_core.DATA_FILE


def configure_data_file(path: str | Any) -> None:
    global DATA_FILE
    hks_core.configure_data_file(path)
    DATA_FILE = hks_core.DATA_FILE


def reset_state() -> None:
    hks_core.reset_state()


def add_green_points(user_id: Any, points: Any, reason: Any, reference_id: Any) -> dict[str, Any]:
    return hks_core.add_green_points(user_id, points, reason, reference_id)


def get_user_points_summary(user_id: Any) -> dict[str, Any]:
    return hks_core.get_user_points_summary(user_id)


def get_tier(balance: int) -> dict[str, Any]:
    return hks_core.get_tier(balance)


def seed_default_vouchers() -> list[dict[str, Any]]:
    return hks_core.seed_default_vouchers()


def get_vouchers() -> list[dict[str, Any]]:
    return hks_core.get_vouchers()


def get_user_coupons(user_id: Any) -> list[dict[str, Any]]:
    return hks_core.get_user_coupons(user_id)


def redeem_voucher(user_id: Any, voucher_id: Any) -> dict[str, Any]:
    return hks_core.redeem_voucher(user_id, voucher_id)


def award_payment(user_id: Any, bill_id: Any, amount: Any = None) -> dict[str, Any]:
    return hks_core.award_payment(user_id, bill_id, amount)


def award_segregation(user_id: Any, collection_id: Any, verified: bool = True) -> dict[str, Any]:
    return hks_core.award_segregation(user_id, collection_id, verified)


def mark_coupon_used(coupon_code: Any) -> dict[str, Any]:
    return hks_core.mark_coupon_used(coupon_code)
