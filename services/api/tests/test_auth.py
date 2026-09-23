from fastapi.testclient import TestClient

from .conftest import signup


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_signup_login_and_me(client: TestClient) -> None:
    res = client.post("/auth/signup", json={"email": " Mina@Example.com ", "password": "correct-horse", "name": "미나"})
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["email"] == "mina@example.com"
    assert body["user"]["name"] == "미나"
    assert "createdAt" in body["user"]

    dup = client.post("/auth/signup", json={"email": "mina@example.com", "password": "another-pass", "name": "x"})
    assert dup.status_code == 409

    bad = client.post("/auth/login", json={"email": "mina@example.com", "password": "wrong-password"})
    assert bad.status_code == 401

    ok = client.post("/auth/login", json={"email": "MINA@example.com", "password": "correct-horse"})
    assert ok.status_code == 200
    headers = {"Authorization": f"Bearer {ok.json()['token']}"}

    me = client.get("/me", headers=headers).json()
    assert me["user"]["email"] == "mina@example.com"
    assert me["faceModel"] is None
    assert me["lookCount"] == 0


def test_validation_messages(client: TestClient) -> None:
    res = client.post("/auth/signup", json={"email": "not-an-email", "password": "correct-horse", "name": "a"})
    assert res.status_code == 422
    assert res.json()["detail"] == "올바른 이메일 주소를 입력해주세요."
    short = client.post("/auth/signup", json={"email": "a@b.co", "password": "short", "name": "a"})
    assert short.status_code == 422


def test_requires_auth(client: TestClient) -> None:
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/looks").status_code == 401
    assert client.post("/scans").status_code == 401


def test_delete_account(client: TestClient) -> None:
    headers = signup(client, "gone@example.com")
    assert client.delete("/me", headers=headers).status_code == 204
    assert client.get("/me", headers=headers).status_code == 401
    assert client.post("/auth/login", json={"email": "gone@example.com", "password": "correct-horse"}).status_code == 401
