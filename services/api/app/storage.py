"""
Blob storage for photos and generated assets.

Clients receive short-lived signed URLs (like S3 pre-signed URLs), so images can be
loaded by <Image> components and GL texture loaders without auth headers. Swap
LocalStorage for an S3/GCS implementation in production; the interface stays the same.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import shutil
import time
from pathlib import Path

_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/_.-]{0,299}$")


def _check_key(key: str) -> str:
    if not _KEY_RE.match(key) or ".." in key.split("/"):
        raise ValueError(f"invalid storage key: {key!r}")
    return key


class LocalStorage:
    def __init__(self, root: Path, secret: str, url_ttl: int) -> None:
        self.root = root
        self.secret = secret.encode()
        self.url_ttl = url_ttl
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / _check_key(key)

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def file_path(self, key: str) -> Path:
        return self._path(key)

    def delete_prefix(self, prefix: str) -> None:
        path = self._path(prefix.rstrip("/"))
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.is_file():
            path.unlink(missing_ok=True)

    # -- signed URLs -----------------------------------------------------------------------

    def _signature(self, key: str, expires: int) -> str:
        return hmac.new(self.secret, f"{key}:{expires}".encode(), hashlib.sha256).hexdigest()[:32]

    def url(self, key: str) -> str:
        """Relative URL; clients resolve it against the API base URL."""
        # Round expiry to the TTL window so repeated calls give cache-friendly identical URLs.
        window = max(self.url_ttl // 2, 60)
        expires = (int(time.time()) // window + 3) * window
        return f"/files/{_check_key(key)}?exp={expires}&sig={self._signature(key, expires)}"

    def verify(self, key: str, expires: int, signature: str) -> bool:
        if expires < time.time():
            return False
        return hmac.compare_digest(self._signature(key, expires), signature)
