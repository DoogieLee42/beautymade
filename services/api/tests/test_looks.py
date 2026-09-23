import base64

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from .conftest import signup
from .synthetic import three_views


@pytest.fixture
def face_id(client: TestClient, auth: dict) -> str:
    scan = client.post("/scans", headers=auth).json()
    client.put(
        f"/scans/{scan['id']}/photos/front",
        headers=auth,
        files={"photo": ("front.jpg", three_views()["front"], "image/jpeg")},
    )
    return client.post(f"/scans/{scan['id']}/submit", headers=auth).json()["faceModelId"]


def _thumbnail() -> str:
    ok, buf = cv2.imencode(".jpg", np.full((64, 64, 3), 180, np.uint8))
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def test_look_crud(client: TestClient, auth: dict, face_id: str) -> None:
    body = {
        "name": "V라인 + 코끝",
        "faceModelId": face_id,
        "values": {"jawline": 0.6, "noseTip": 0.35, "lift": 0},
        "presetId": "v-line",
        "engineVersion": 1,
        "thumbnail": _thumbnail(),
    }
    created = client.post("/looks", headers=auth, json=body)
    assert created.status_code == 201, created.text
    look = created.json()
    assert look["values"] == {"jawline": 0.6, "noseTip": 0.35}  # zeros are dropped
    assert look["thumbnailUrl"]
    assert client.get(look["thumbnailUrl"]).status_code == 200

    client.post("/looks", headers=auth, json={**body, "name": "두 번째", "thumbnail": None})
    listed = client.get("/looks", headers=auth).json()
    assert [item["name"] for item in listed] == ["두 번째", "V라인 + 코끝"]  # newest first
    assert client.get(f"/looks?face_model_id={face_id}", headers=auth).json()[0]["name"] == "두 번째"

    patched = client.patch(
        f"/looks/{look['id']}", headers=auth, json={"name": "최종", "values": {"noseBridge": -0.2}, "presetId": None}
    ).json()
    assert patched["name"] == "최종"
    assert patched["values"] == {"noseBridge": -0.2}
    assert patched["presetId"] is None
    assert client.get(f"/looks/{look['id']}", headers=auth).json()["name"] == "최종"

    assert client.delete(f"/looks/{look['id']}", headers=auth).status_code == 204
    assert client.get(f"/looks/{look['id']}", headers=auth).status_code == 404
    assert client.get("/me", headers=auth).json()["lookCount"] == 1


def test_look_validation(client: TestClient, auth: dict, face_id: str) -> None:
    base = {"name": "x", "faceModelId": face_id, "values": {}}
    assert client.post("/looks", headers=auth, json={**base, "values": {"noseTip": 1.5}}).status_code == 422
    assert client.post("/looks", headers=auth, json={**base, "values": {"bad key!": 0.1}}).status_code == 422
    assert client.post("/looks", headers=auth, json={**base, "name": ""}).status_code == 422
    assert client.post("/looks", headers=auth, json={**base, "thumbnail": "bm90IGFuIGltYWdl"}).status_code == 400
    assert client.post("/looks", headers=auth, json={**base, "faceModelId": "missing"}).status_code == 404


def test_looks_are_private(client: TestClient, auth: dict, face_id: str) -> None:
    look = client.post("/looks", headers=auth, json={"name": "mine", "faceModelId": face_id, "values": {}}).json()
    other = signup(client, "other@example.com", "다른사람")
    assert client.get("/looks", headers=other).json() == []
    assert client.get(f"/looks/{look['id']}", headers=other).status_code == 404
    assert client.delete(f"/looks/{look['id']}", headers=other).status_code == 404
    stolen = {"name": "x", "faceModelId": face_id, "values": {}}
    assert client.post("/looks", headers=other, json=stolen).status_code == 404


def test_deleting_face_model_removes_its_looks(client: TestClient, auth: dict, face_id: str) -> None:
    client.post("/looks", headers=auth, json={"name": "a", "faceModelId": face_id, "values": {"lift": 0.5}})
    assert client.delete(f"/face-models/{face_id}", headers=auth).status_code == 204
    assert client.get("/looks", headers=auth).json() == []
    assert client.get("/face-models/current", headers=auth).status_code == 404
