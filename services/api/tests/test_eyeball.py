from functools import lru_cache

import cv2
import numpy as np

from app.reconstruction.eyeball import EYE_MM, PX_PER_MM, _to_texture
from app.reconstruction.eyes import IRIS_DIAMETER_MM, LEFT_EYE, RIGHT_EYE, eye_frame
from app.reconstruction.landmarker import shared_landmarker
from app.reconstruction.pipeline import ReconstructionResult, reconstruct

from .synthetic import front_photo


@lru_cache(maxsize=1)
def _result() -> ReconstructionResult:
    return reconstruct({"front": front_photo()})


def _atlas() -> np.ndarray:
    data = _result().eyes_jpg
    assert data is not None
    return cv2.cvtColor(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def _luma(rgb: np.ndarray) -> float:
    return float(np.mean(rgb.astype(np.float32) @ [0.299, 0.587, 0.114]))


def test_atlas_holds_both_eyes_level_and_to_scale() -> None:
    meta = _result().model["eyeTexture"]
    w, h = round(EYE_MM[0] * PX_PER_MM), round(EYE_MM[1] * PX_PER_MM)
    assert (meta["width"], meta["height"]) == (2 * w, h)
    assert _atlas().shape == (h, 2 * w, 3)


def test_maps_put_the_model_lids_where_the_photo_shows_them() -> None:
    result = _result()
    meta = result.model["eyeTexture"]
    positions = np.array(result.model["mesh"]["positions"]).reshape(-1, 3)
    photo = front_photo()
    frame = eye_frame(shared_landmarker().detect(photo)[0].landmarks, photo.shape[1], photo.shape[0])
    assert frame is not None
    w, h = meta["width"] // 2, meta["height"]
    for half, (name, eye) in enumerate((("right", RIGHT_EYE), ("left", LEFT_EYE))):
        u, v = np.array(meta[name]["u"]), np.array(meta[name]["v"])
        points = np.hstack([positions[eye.loop], np.ones((len(eye.loop), 1))])
        atlas_px = np.stack([(points @ u) * 2 * w, (1 - points @ v) * h], axis=1)
        expected = _to_texture(frame, eye, frame.px[eye.loop], w, h) + [half * w, 0]
        # Within ~0.3 mm: the map follows the detected lids around each eye.
        assert np.abs(atlas_px - expected).max() < 0.3 * PX_PER_MM, name


def test_completes_the_iris_under_the_upper_lid() -> None:
    atlas = _atlas()
    h = atlas.shape[0]
    r = IRIS_DIAMETER_MM / 2 * PX_PER_MM
    for cx in (atlas.shape[1] // 4, 3 * atlas.shape[1] // 4):
        cy = h // 2
        # Above the pupil, where the upper lid covered the iris in the photo.
        top = round(cy - 0.75 * r)
        hidden_iris = atlas[top - 2 : top + 3, cx - 8 : cx + 8]
        visible_iris = atlas[cy + 5 : cy + 15, cx - 25 : cx - 15]
        white = atlas[cy - 4 : cy + 4, round(cx - 1.6 * r) - 4 : round(cx - 1.6 * r) + 4]
        # The rebuilt top of the iris is iris-dark, not the white around it.
        assert _luma(hidden_iris) < _luma(white) - 80
        assert _luma(hidden_iris) < _luma(visible_iris) + 60


def test_turns_pink_past_the_inner_corners() -> None:
    atlas = _atlas().astype(np.float32)
    h, w = atlas.shape[0], atlas.shape[1] // 2
    cy = h // 2
    # Just past each inner corner (towards the nose, i.e. the middle of the atlas).
    for patch in (atlas[cy - 5 : cy + 20, w - 30 : w - 10], atlas[cy - 5 : cy + 20, w + 10 : w + 30]):
        r, g, b = patch.reshape(-1, 3).mean(axis=0)
        assert r - (g + b) / 2 > 15
