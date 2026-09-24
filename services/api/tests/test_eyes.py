import math
from functools import lru_cache

import numpy as np
import pytest

from app.reconstruction.eyes import IRIS_DIAMETER_MM, measure_eyes
from app.reconstruction.landmarker import shared_landmarker

from .synthetic import front_photo


@lru_cache(maxsize=1)
def _front() -> tuple[np.ndarray, int, int]:
    img = front_photo()
    return shared_landmarker().detect(img)[0].landmarks, img.shape[1], img.shape[0]


def _transformed(angle_deg: float = 0.0, zoom: float = 1.0) -> np.ndarray:
    """The photo's landmarks as if the head were rolled by angle_deg and the camera zoomed in."""
    landmarks, w, h = _front()
    px = landmarks[:, :2] * [w, h] - [w / 2, h / 2]
    a = math.radians(angle_deg)
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    out = landmarks.copy()
    out[:, :2] = ((px @ rot.T) * zoom + [w / 2, h / 2]) / [w, h]
    return out


def test_measures_a_real_face_in_millimetres() -> None:
    eyes = measure_eyes(*_front())
    assert eyes is not None
    assert eyes["irisDiameterMm"] == IRIS_DIAMETER_MM
    for side in ("right", "left"):
        eye = eyes[side]
        assert 22 < eye["widthMm"] < 30
        assert 6 < eye["heightMm"] < 12
        assert 2 < eye["mrd1Mm"] < 6
        assert 2 < eye["mrd2Mm"] < 7
        assert eye["heightMm"] == pytest.approx(eye["mrd1Mm"] + eye["mrd2Mm"], abs=0.11)
        assert 0 < eye["tiltDeg"] < 12  # outer corners a little higher than the inner ones
    assert 26 < eyes["intercanthalMm"] < 36
    assert 52 < eyes["interpupillaryMm"] < 68
    # Outer corner to outer corner: roughly both eyes plus the gap between them.
    across = eyes["intercanthalMm"] + eyes["right"]["widthMm"] + eyes["left"]["widthMm"]
    assert eyes["outerCanthalMm"] == pytest.approx(across, abs=2)
    width = (eyes["right"]["widthMm"] + eyes["left"]["widthMm"]) / 2
    assert eyes["intercanthalRatio"] == pytest.approx(eyes["intercanthalMm"] / width, abs=0.015)


def test_ignores_head_roll_and_photo_scale() -> None:
    _, w, h = _front()
    base = measure_eyes(*_front())
    for angle, zoom in ((12, 1.0), (-9, 1.0), (0, 0.8), (7, 1.15)):
        eyes = measure_eyes(_transformed(angle, zoom), w, h)
        assert eyes is not None
        for side in ("right", "left"):
            for key in ("widthMm", "heightMm", "mrd1Mm", "mrd2Mm"):
                assert eyes[side][key] == pytest.approx(base[side][key], abs=0.15), (angle, zoom, side, key)
            assert eyes[side]["tiltDeg"] == pytest.approx(base[side]["tiltDeg"], abs=0.15)
        assert eyes["intercanthalRatio"] == pytest.approx(base["intercanthalRatio"], abs=0.015)


def test_rejects_unreliable_landmarks() -> None:
    landmarks, w, h = _front()
    # No iris landmarks (the plain 468-point mesh).
    assert measure_eyes(landmarks[:468], w, h) is None
    # Irises that disagree about the scale.
    shrunk = landmarks.copy()
    shrunk[469:473, :2] = shrunk[468, :2] + (shrunk[469:473, :2] - shrunk[468, :2]) * 0.6
    assert measure_eyes(shrunk, w, h) is None
    # Closed eyes: the upper lids on the lower ones.
    closed = landmarks.copy()
    for upper, lower in zip((159, 158, 160, 386, 385, 387), (145, 153, 144, 374, 380, 373), strict=True):
        closed[upper] = closed[lower]
    assert measure_eyes(closed, w, h) is None
