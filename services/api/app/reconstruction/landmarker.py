"""Thin wrapper around the MediaPipe Face Landmarker (478 3D landmarks + blendshapes)."""

from __future__ import annotations

import logging
import os
import threading
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / ".models" / "face_landmarker.task"


@dataclass
class FaceDetection:
    """Landmarks are normalised: x, y in [0, 1] of the image; z roughly in units of image width."""

    landmarks: np.ndarray  # (478, 3)
    blendshapes: dict[str, float]


def ensure_model(path: Path | None = None) -> Path:
    path = Path(os.environ.get("FACE_LANDMARKER_MODEL", "") or path or DEFAULT_MODEL_PATH)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading face landmarker model to %s", path)
    tmp = path.with_suffix(".download")
    with urllib.request.urlopen(MODEL_URL, timeout=60) as resp, open(tmp, "wb") as out:
        out.write(resp.read())
    tmp.replace(path)
    return path


class FaceLandmarker:
    """Thread-safe (serialised) face landmarker. Detection takes ~15 ms on a laptop CPU."""

    def __init__(self, model_path: Path | None = None) -> None:
        from mediapipe.tasks.python import BaseOptions, vision

        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(ensure_model(model_path))),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=3,
            min_face_detection_confidence=0.4,
            min_face_presence_confidence=0.4,
            output_face_blendshapes=True,
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(options)
        self._lock = threading.Lock()

    def detect(self, rgb: np.ndarray) -> list[FaceDetection]:
        import mediapipe as mp

        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        with self._lock:
            result = self._landmarker.detect(image)
        faces = []
        for i, lms in enumerate(result.face_landmarks):
            landmarks = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float64)
            shapes = {}
            if result.face_blendshapes and i < len(result.face_blendshapes):
                shapes = {b.category_name: float(b.score) for b in result.face_blendshapes[i]}
            faces.append(FaceDetection(landmarks=landmarks, blendshapes=shapes))
        return faces

    def close(self) -> None:
        with self._lock:
            self._landmarker.close()


_shared: FaceLandmarker | None = None
_shared_lock = threading.Lock()


def shared_landmarker() -> FaceLandmarker:
    global _shared
    with _shared_lock:
        if _shared is None:
            _shared = FaceLandmarker()
        return _shared
