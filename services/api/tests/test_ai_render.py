import base64
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.ai_render import build_prompt, describe_changes

from .conftest import make_client, signup
from .synthetic import front_photo


def _guide() -> str:
    img = np.full((400, 300, 3), 90, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def _face(client: TestClient, auth: dict) -> str:
    scan = client.post("/scans", headers=auth).json()
    ok, jpg = cv2.imencode(".jpg", cv2.cvtColor(front_photo(), cv2.COLOR_RGB2BGR))
    assert ok
    files = {"photo": ("front.jpg", jpg.tobytes(), "image/jpeg")}
    assert client.put(f"/scans/{scan['id']}/photos/front", headers=auth, files=files).status_code == 200
    return client.post(f"/scans/{scan['id']}/submit", headers=auth).json()["faceModelId"]


def test_prompt_describes_changes_in_words() -> None:
    lines = describe_changes({"noseBridge": 0.8, "jawline": 0.4, "lipVolume": -0.2, "lift": -0.5, "skinTone": 0.01})
    assert lines == [
        "clearly a higher, more defined nose bridge",
        "moderately a slimmer, V-shaped jawline",
        "very subtly thinner lips",
    ]
    prompt = build_prompt({}, "front")
    assert "none: show the person exactly as they are" in prompt
    assert "facing the camera straight on" in prompt


def test_disabled_without_a_provider(client: TestClient, auth: dict) -> None:
    assert client.get("/ai-renders/status", headers=auth).json()["enabled"] is False
    res = client.post("/ai-renders", headers=auth, json={"faceModelId": "x", "guide": _guide()})
    assert res.status_code == 503


def test_render_cache_limit_and_cleanup(tmp_path: Path) -> None:
    with make_client(tmp_path, ai_provider="fake", ai_daily_limit=1) as client:
        auth = signup(client)
        status = client.get("/ai-renders/status", headers=auth).json()
        assert status == {"enabled": True, "provider": "fake", "remainingToday": 1}
        face_id = _face(client, auth)
        body = {"faceModelId": face_id, "values": {"noseBridge": 0.5}, "angle": "left", "guide": _guide()}

        first = client.post("/ai-renders", headers=auth, json=body)
        assert first.status_code == 200, first.text
        assert first.json()["cached"] is False and first.json()["remainingToday"] == 0
        image = client.get(first.json()["url"])
        assert image.headers["content-type"] == "image/jpeg"

        # The same look and angle again is served from the cache and costs nothing.
        again = client.post("/ai-renders", headers=auth, json=body).json()
        assert again["cached"] is True and again["url"].split("?")[0] == first.json()["url"].split("?")[0]

        other = client.post("/ai-renders", headers=auth, json={**body, "angle": "front"})
        assert other.status_code == 429

        # Other people cannot render from someone else's face.
        intruder = signup(client, "other@example.com", "다른")
        assert client.post("/ai-renders", headers=intruder, json=body).status_code == 404

        assert client.delete(f"/face-models/{face_id}", headers=auth).status_code == 204
        assert client.get(first.json()["url"]).status_code == 404
