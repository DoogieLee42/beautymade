"""
Eye measurements in millimetres, from the front photo.

MediaPipe's iris landmarks give the width of the iris in pixels. The visible iris of adults is
about 11.7 mm wide and varies little between people, so it serves as the ruler that turns the
photo into millimetres. The results are estimates (about +-1 mm): irises differ a little in
size and the landmarks are approximate.

"right" and "left" are the person's own eyes; in a front photo their right eye is on the
viewer's left (MediaPipe landmarks 33/133, iris 468).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

IRIS_DIAMETER_MM = 11.7


@dataclass(frozen=True)
class EyeIndices:
    inner: int
    outer: int
    upper: tuple[int, ...]  # lid margin between the corners, inner to outer
    lower: tuple[int, ...]
    iris: int  # iris centre; the next four landmarks lie on the iris edge

    @property
    def loop(self) -> list[int]:
        """The lid margin all the way round: inner corner, upper lid, outer corner, lower lid."""
        return [self.inner, *self.upper, self.outer, *reversed(self.lower)]


RIGHT_EYE = EyeIndices(133, 33, (173, 157, 158, 159, 160, 161, 246), (155, 154, 153, 145, 144, 163, 7), 468)
LEFT_EYE = EyeIndices(362, 263, (398, 384, 385, 386, 387, 388, 466), (382, 381, 380, 374, 373, 390, 249), 473)
_RIGHT, _LEFT = RIGHT_EYE, LEFT_EYE


@dataclass(frozen=True)
class EyeFrame:
    """The front photo turned so the pupils sit on a horizontal line, with its millimetre scale."""

    px: np.ndarray  # (478, 2) landmarks in photo pixels
    across: np.ndarray  # unit vector in the photo from the right pupil to the left one
    down: np.ndarray  # unit vector at right angles to it, pointing down the face
    points: np.ndarray  # (478, 2) landmarks in the turned frame (pixels, right pupil at 0)
    mm_per_px: float


def eye_frame(landmarks: np.ndarray, width: int, height: int) -> EyeFrame | None:
    """None without iris landmarks, or when the two irises disagree about the scale."""
    if landmarks.shape[0] < 478:
        return None
    px = landmarks[:, :2] * [width, height]
    axis = px[_LEFT.iris] - px[_RIGHT.iris]
    across = axis / np.linalg.norm(axis)
    down = np.array([-across[1], across[0]])
    rel = px - px[_RIGHT.iris]
    pts = np.stack([rel @ across, rel @ down], axis=1)
    irises = [_iris_width(pts, eye) for eye in (_RIGHT, _LEFT)]
    iris_px = float(np.mean(irises))
    if iris_px <= 0 or abs(irises[0] - irises[1]) > 0.2 * iris_px:
        return None
    return EyeFrame(px=px, across=across, down=down, points=pts, mm_per_px=IRIS_DIAMETER_MM / iris_px)


def measure_eyes(landmarks: np.ndarray, width: int, height: int) -> dict | None:
    """
    Measurements for model.json from MediaPipe's 478 normalised landmarks of the front photo,
    or None when they don't look reliable (no iris landmarks, closed eyes, implausible sizes).
    """
    frame = eye_frame(landmarks, width, height)
    if frame is None:
        return None
    pts, mm = frame.points, frame.mm_per_px

    right, left = _measure_eye(pts, _RIGHT, mm), _measure_eye(pts, _LEFT, mm)
    eye_width = (right["widthMm"] + left["widthMm"]) / 2
    intercanthal = float(np.linalg.norm(pts[_LEFT.inner] - pts[_RIGHT.inner])) * mm
    interpupillary = float(np.linalg.norm(pts[_LEFT.iris] - pts[_RIGHT.iris])) * mm
    outer_canthal = float(np.linalg.norm(pts[_LEFT.outer] - pts[_RIGHT.outer])) * mm
    # Adult eyes are roughly 22-34 mm wide with pupils 50-75 mm apart; far outside that the
    # landmarks are wrong. Nearly closed eyes can't be measured either.
    if not (18 <= eye_width <= 40 and 45 <= interpupillary <= 80):
        return None
    if min(right["heightMm"], left["heightMm"]) < 4:
        return None
    return {
        "irisDiameterMm": IRIS_DIAMETER_MM,
        "right": right,
        "left": left,
        "intercanthalMm": round(intercanthal, 1),
        "interpupillaryMm": round(interpupillary, 1),
        "outerCanthalMm": round(outer_canthal, 1),
        "intercanthalRatio": round(intercanthal / eye_width, 2),
    }


def _iris_width(pts: np.ndarray, eye: EyeIndices) -> float:
    """Horizontal iris diameter in pixels (the lids often hide the top and bottom of the iris)."""
    edge = pts[eye.iris + 1 : eye.iris + 5]
    pairs = (edge[0] - edge[2], edge[1] - edge[3])
    return float(np.linalg.norm(max(pairs, key=lambda v: abs(v[0]))))


def _measure_eye(pts: np.ndarray, eye: EyeIndices, mm: float) -> dict:
    inner, outer, pupil = pts[eye.inner], pts[eye.outer], pts[eye.iris]
    upper = _lid_y(pts, eye, eye.upper, pupil[0])
    lower = _lid_y(pts, eye, eye.lower, pupil[0])
    return {
        "widthMm": round(float(np.linalg.norm(outer - inner)) * mm, 1),
        "heightMm": round((lower - upper) * mm, 1),
        # Canthal tilt: positive when the outer corner sits higher than the inner one.
        "tiltDeg": round(math.degrees(math.atan2(inner[1] - outer[1], abs(outer[0] - inner[0]))), 1),
        # Margin-reflex distances: pupil centre to the upper (MRD1) and lower (MRD2) lid margin.
        "mrd1Mm": round((pupil[1] - upper) * mm, 1),
        "mrd2Mm": round((lower - pupil[1]) * mm, 1),
    }


def _lid_y(pts: np.ndarray, eye: EyeIndices, margin: tuple[int, ...], x: float) -> float:
    """Height of a lid margin (corner to corner) at x, interpolating between its landmarks."""
    chain = pts[[eye.inner, *margin, eye.outer]]
    order = np.argsort(chain[:, 0])
    return float(np.interp(x, chain[order, 0], chain[order, 1]))
