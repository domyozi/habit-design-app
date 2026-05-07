"""
Anthropic API への metadata.user_id 用 helper

【設計方針】:
- Supabase の生 UUID を Anthropic 側に蓄積させない
- SHA256(user_id + salt) → 64 char hex（Anthropic の metadata 値長制限 256 chars 以内）
- salt 未設定時は dev では空文字で動作（hash は固定的だが本番のみ強制）
"""
from __future__ import annotations

import hashlib

from app.core.config import settings


def hashed_user_id(user_id: str) -> str:
    """
    Supabase user_id を SHA256(user_id + ANTHROPIC_USER_ID_SALT) でハッシュ化。

    Anthropic の `metadata.user_id` に渡すための値。Anthropic Console / Usage API
    でユーザー単位の集計を見られるが、生 UUID では取り戻せない（Anthropic 側で
    PII として扱う必要が無くなる）。同じユーザーは常に同じ hash になるため、
    Anthropic 側の集計でも user 単位で見られる。
    """
    salt = settings.ANTHROPIC_USER_ID_SALT or ""
    return hashlib.sha256(f"{user_id}{salt}".encode("utf-8")).hexdigest()
