from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt


def _prehash(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes; pre-hashing keeps long passphrases meaningful.
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: str, secret: str, ttl_minutes: int) -> str:
    now = datetime.now(UTC)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=ttl_minutes)}
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str, secret: str) -> str | None:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
