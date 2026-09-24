import cv2
import numpy as np
from fastapi.testclient import TestClient

from .conftest import signup
from .synthetic import encode_jpg, three_views


def _upload(client: TestClient, headers: dict, scan_id: str, view: str, data: bytes):
    return client.put(
        f"/scans/{scan_id}/photos/{view}", headers=headers, files={"photo": (f"{view}.jpg", data, "image/jpeg")}
    )


def test_full_scan_to_face_model(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    assert scan["status"] == "capturing"
    assert scan["photos"] == []

    views = three_views()
    for view, data in views.items():
        res = _upload(client, auth, scan["id"], view, data)
        assert res.status_code == 200, res.text
        photo = res.json()
        assert photo["ok"], photo["issues"]
        assert photo["view"] == view
        assert photo["url"].startswith("/files/")
    poses = {p["view"]: p["pose"]["yaw"] for p in client.get(f"/scans/{scan['id']}", headers=auth).json()["photos"]}
    assert abs(poses["front"]) < 12
    assert poses["left"] > 15  # turned to the subject's left
    assert poses["right"] < -15

    done = client.post(f"/scans/{scan['id']}/submit", headers=auth).json()
    assert done["status"] == "completed", done
    assert done["progress"] == 1.0
    assert done["faceModelId"]

    face = client.get("/face-models/current", headers=auth).json()
    assert face["id"] == done["faceModelId"]
    # Face landmarks first, then the head shell the app stitches on.
    mesh = face["mesh"]
    vertex_count = len(mesh["positions"]) // 3
    assert vertex_count > 468 + 1000
    assert len(mesh["uvs"]) == vertex_count * 2
    assert len(mesh["indices"]) % 3 == 0 and len(mesh["indices"]) > 898 * 3
    assert max(mesh["indices"]) < vertex_count
    assert mesh["landmarkCount"] == 468
    head = mesh["head"]
    assert len(head["oval"]) == 36 and len(head["ringUvs"]) == 72
    assert all(468 <= v < vertex_count for v in head["rim"] + head["weld"])
    uvs = np.array(mesh["uvs"]).reshape(-1, 2)
    assert uvs[:468, 0].max() <= 0.5 < uvs[468:, 0].min()  # face chart left, head chart right
    assert set(face["quality"]["viewsUsed"]) == {"front", "left", "right"}
    assert face["atlasSize"] in (1024, 2048)
    assert len(face["skinTone"]) == 3
    eyes = face["eyes"]  # measured on the front photo (see test_eyes.py)
    assert 20 < eyes["right"]["widthMm"] < 32 and 20 < eyes["left"]["widthMm"] < 32
    assert 0.9 < eyes["intercanthalRatio"] < 1.6
    # The clean eyeball atlas and where the model's eyes fall in it (see test_eyeball.py).
    assert len(face["eyeTexture"]["right"]["u"]) == 4 and len(face["eyeTexture"]["left"]["v"]) == 4
    atlas = client.get(face["textures"]["eyes"])
    assert atlas.status_code == 200 and atlas.headers["content-type"] == "image/jpeg"

    # The fused shape lives in the canonical frame: nose in front, chin below the forehead.
    pos = np.array(face["mesh"]["positions"]).reshape(-1, 3)
    assert pos[4, 2] > pos[33, 2] + 2
    assert pos[10, 1] > pos[152, 1] + 12

    for url in [face["textures"]["albedo"], face["textures"]["smooth"], face["thumbnailUrl"]]:
        img = client.get(url)
        assert img.status_code == 200
        assert img.headers["content-type"] == "image/jpeg"
        decoded = cv2.imdecode(np.frombuffer(img.content, np.uint8), cv2.IMREAD_COLOR)
        assert decoded is not None and decoded.shape[0] >= 512
        if url != face["thumbnailUrl"]:
            assert decoded.shape[1] == 2 * decoded.shape[0]  # two square charts
    assert client.get(face["textures"]["mask"]).headers["content-type"] == "image/png"

    me = client.get("/me", headers=auth).json()
    assert me["faceModel"]["id"] == face["id"]


def test_signed_urls_reject_tampering(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    photo = _upload(client, auth, scan["id"], "front", three_views()["front"]).json()
    assert client.get(photo["url"]).status_code == 200
    assert client.get(photo["url"].replace("sig=", "sig=0")).status_code == 404
    assert client.get(photo["url"].replace("front.jpg", "left.jpg")).status_code == 404
    assert client.get("/files/../../etc/passwd?exp=9999999999&sig=x").status_code == 404


def test_rejects_photos_without_a_face(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    blank = encode_jpg(np.full((800, 600, 3), 200, np.uint8))
    photo = _upload(client, auth, scan["id"], "front", blank).json()
    assert not photo["ok"]
    assert photo["issues"][0]["code"] == "no_face"
    res = client.post(f"/scans/{scan['id']}/submit", headers=auth)
    assert res.status_code == 422

    garbage = _upload(client, auth, scan["id"], "front", b"not an image")
    assert garbage.status_code == 400


def test_side_view_checks_direction(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    views = three_views()
    wrong = _upload(client, auth, scan["id"], "left", views["right"]).json()
    assert not wrong["ok"]
    assert wrong["issues"][0]["code"] == "wrong_direction"
    frontal = _upload(client, auth, scan["id"], "right", views["front"]).json()
    assert frontal["issues"][0]["code"] == "turn_more"


def test_front_only_scan_still_works(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    _upload(client, auth, scan["id"], "front", three_views()["front"])
    done = client.post(f"/scans/{scan['id']}/submit", headers=auth).json()
    assert done["status"] == "completed"
    face = client.get(f"/face-models/{done['faceModelId']}", headers=auth).json()
    assert face["quality"]["viewsUsed"] == ["front"]


def test_scans_are_private(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    other = signup(client, "other@example.com", "다른사람")
    assert client.get(f"/scans/{scan['id']}", headers=other).status_code == 404
    assert _upload(client, other, scan["id"], "front", three_views()["front"]).status_code == 404
    assert client.get("/face-models/current", headers=other).status_code == 404


def test_deleting_face_removes_scan_photos(client: TestClient, auth: dict) -> None:
    scan = client.post("/scans", headers=auth).json()
    photo_url = _upload(client, auth, scan["id"], "front", three_views()["front"]).json()["url"]
    done = client.post(f"/scans/{scan['id']}/submit", headers=auth).json()
    assert done["status"] == "completed", done
    assert client.get(photo_url).status_code == 200

    assert client.delete(f"/face-models/{done['faceModelId']}", headers=auth).status_code == 204
    assert client.get(photo_url).status_code == 404
    assert client.get(f"/scans/{scan['id']}", headers=auth).status_code == 404
    assert client.get("/face-models/current", headers=auth).status_code == 404
