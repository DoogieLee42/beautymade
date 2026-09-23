from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        storage_dir=tmp_path / "storage",
        secret_key="test-secret-key-that-is-long-enough-for-hs256",
        inline_jobs=True,
    )
    with TestClient(create_app(settings)) as c:
        yield c


def signup(client: TestClient, email: str = "mina@example.com", name: str = "미나") -> dict[str, str]:
    res = client.post("/auth/signup", json={"email": email, "password": "correct-horse", "name": name})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return signup(client)
