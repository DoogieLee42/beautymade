from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_client(tmp_path: Path, **overrides: object) -> TestClient:
    options: dict[str, object] = {
        "database_url": f"sqlite:///{tmp_path / 'test.db'}",
        "storage_dir": tmp_path / "storage",
        "secret_key": "test-secret-key-that-is-long-enough-for-hs256",
        "inline_jobs": True,
        # Never reach a real AI provider from tests, whatever a local .env says.
        "ai_provider": "",
        "gemini_api_key": "",
        "openai_api_key": "",
    }
    settings = Settings(**{**options, **overrides})  # type: ignore[arg-type]
    return TestClient(create_app(settings))


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    with make_client(tmp_path) as c:
        yield c


def signup(client: TestClient, email: str = "mina@example.com", name: str = "미나") -> dict[str, str]:
    res = client.post("/auth/signup", json={"email": email, "password": "correct-horse", "name": name})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return signup(client)
