"""Thin wrapper around the MediaPipe selfie multi-class segmenter (hair / skin / clothes / background)."""

from __future__ import annotations

import logging
import os
import threading
import urllib.request
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
    "selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite"
)
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / ".models" / "selfie_multiclass_256x256.tflite"

# Category ids of the model.
BACKGROUND, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHER = range(6)


def ensure_model(path: Path | None = None) -> Path:
    path = Path(os.environ.get("SELFIE_SEGMENTER_MODEL", "") or path or DEFAULT_MODEL_PATH)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading selfie segmenter model to %s", path)
    tmp = path.with_suffix(".download")
    with urllib.request.urlopen(MODEL_URL, timeout=60) as resp, open(tmp, "wb") as out:
        out.write(resp.read())
    tmp.replace(path)
    return path


class SelfieSegmenter:
    """Thread-safe (serialised) segmenter. Returns a category per pixel at the image's resolution."""

    def __init__(self, model_path: Path | None = None) -> None:
        from mediapipe.tasks.python import BaseOptions, vision

        options = vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(ensure_model(model_path))),
            running_mode=vision.RunningMode.IMAGE,
            output_category_mask=True,
            output_confidence_masks=False,
        )
        self._segmenter = vision.ImageSegmenter.create_from_options(options)
        self._lock = threading.Lock()

    def segment(self, rgb: np.ndarray) -> np.ndarray:
        import mediapipe as mp

        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        with self._lock:
            result = self._segmenter.segment(image)
        mask = result.category_mask.numpy_view().copy()
        if mask.ndim == 3:
            mask = mask[..., 0]
        if mask.shape[:2] != rgb.shape[:2]:
            mask = cv2.resize(mask, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_NEAREST)
        return mask.astype(np.uint8)

    def close(self) -> None:
        with self._lock:
            self._segmenter.close()


_shared: SelfieSegmenter | None = None
_shared_lock = threading.Lock()


def shared_segmenter() -> SelfieSegmenter:
    global _shared
    with _shared_lock:
        if _shared is None:
            _shared = SelfieSegmenter()
        return _shared
