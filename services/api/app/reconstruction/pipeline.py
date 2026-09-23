"""
Photos -> 3D face model.

  1. analyse    MediaPipe landmarks + pose/quality per photo
  2. shape      rigidly align the views and fuse their landmarks into one 3D shape
  3. texture    bake all photos into a UV atlas (visibility-aware, multi-band blended)
  4. finish     skin mask, smoothed skin texture, thumbnail, model.json

The mobile app subdivides the 468-landmark mesh and applies the beauty deformations
on-device, so this service only has to produce the base mesh and textures.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

import cv2
import numpy as np

from .geometry import ViewGeometry, fuse_views, head_pose, to_camera_space
from .landmarker import FaceLandmarker, shared_landmarker
from .quality import VIEWS, PhotoAnalysis, View, analyze_photo
from .texture import (
    ViewTexture,
    atlas_uvs,
    bake_atlas,
    mean_skin_color,
    skin_mask,
    smooth_skin,
)
from .topology import LANDMARK_COUNT, canonical_face, vertex_normals

MODEL_FORMAT = "beautymade.face-model"
MODEL_VERSION = 1

ProgressFn = Callable[[float, str], None]


class ReconstructionError(Exception):
    """A problem with the input photos that the user can fix by rescanning."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class ReconstructionResult:
    model: dict
    albedo_jpg: bytes
    smooth_jpg: bytes
    mask_png: bytes
    thumbnail_jpg: bytes
    stats: dict = field(default_factory=dict)


def _noop(_: float, __: str) -> None:
    pass


def reconstruct(
    photos: dict[View, np.ndarray],
    progress: ProgressFn = _noop,
    landmarker: FaceLandmarker | None = None,
) -> ReconstructionResult:
    """Builds a face model from RGB photos keyed by view. Only the front view is required."""
    started = time.perf_counter()
    if "front" not in photos:
        raise ReconstructionError("missing_front", "정면 사진이 필요해요.")
    landmarker = landmarker or shared_landmarker()

    # 1. analyse ----------------------------------------------------------------------------
    progress(0.05, "analyzing")
    analyses: dict[View, PhotoAnalysis] = {}
    for i, view in enumerate(v for v in VIEWS if v in photos):
        analysis = analyze_photo(photos[view], view, landmarker)
        if view == "front" and not analysis.ok:
            first = next((iss for iss in analysis.issues if iss.severity == "error"), None)
            if first is None:
                raise ReconstructionError("bad_front", "정면 사진을 다시 찍어주세요.")
            raise ReconstructionError(first.code, first.message)
        if analysis.detection is not None and analysis.ok:
            analyses[view] = analysis
        progress(0.05 + 0.25 * (i + 1) / len(photos), "analyzing")

    # 2. shape ------------------------------------------------------------------------------
    progress(0.35, "shaping")
    geoms = [
        ViewGeometry(name=v, points=to_camera_space(a.detection.landmarks, a.width, a.height))  # type: ignore[union-attr]
        for v, a in analyses.items()
    ]
    fused = fuse_views(geoms)
    positions = fused.positions
    progress(0.5, "shaping")

    # 3. texture ----------------------------------------------------------------------------
    progress(0.55, "texturing")
    face = canonical_face()
    normals = vertex_normals(positions, face.triangles)
    front_analysis = analyses["front"]
    face_width_px = front_analysis.face_box[2] * front_analysis.width if front_analysis.face_box else 0
    atlas_size = 2048 if face_width_px > 900 else 1024
    view_textures = []
    for geom in fused.views:
        a = analyses[geom.name]  # type: ignore[index]
        lm = a.detection.landmarks[:LANDMARK_COUNT]  # type: ignore[union-attr]
        camera_space = geom.to_face.invert(positions)
        view_textures.append(
            ViewTexture(
                name=geom.name,
                image=photos[geom.name],  # type: ignore[index]
                pixels=np.stack([lm[:, 0] * a.width, lm[:, 1] * a.height], axis=1),
                toward_camera=geom.to_face.rotation[:, 2],
                depth=camera_space[:, 2],
                preference=2.0 if geom.name == "front" else 1.0,
            )
        )
    baked = bake_atlas(view_textures, normals, atlas_size)
    progress(0.85, "texturing")

    # 4. finish -----------------------------------------------------------------------------
    progress(0.9, "finishing")
    mask = skin_mask(512)
    smooth = smooth_skin(baked.albedo, 1024)
    thumbnail = _thumbnail(photos["front"], front_analysis)

    views_meta = {}
    for geom in fused.views:
        pose = head_pose(geom.to_face)
        views_meta[geom.name] = {
            "yaw": round(pose.yaw, 1),
            "pitch": round(pose.pitch, 1),
            "roll": round(pose.roll, 1),
            "textureShare": round(baked.weights.get(geom.name, 0.0), 3),
        }
    skipped = [v for v in photos if v not in analyses]
    model = {
        "format": MODEL_FORMAT,
        "version": MODEL_VERSION,
        "mesh": {
            "positions": [round(float(x), 4) for x in positions.reshape(-1)],
            "uvs": [round(float(x), 5) for x in atlas_uvs().reshape(-1)],
            "indices": face.triangles.reshape(-1).tolist(),
            "landmarkCount": LANDMARK_COUNT,
        },
        "atlasSize": atlas_size,
        "skinTone": mean_skin_color(baked.albedo, mask),
        "views": views_meta,
        "quality": {
            "viewsUsed": list(analyses.keys()),
            "viewsSkipped": skipped,
            "multiViewResidual": round(fused.residual, 4),
        },
    }
    result = ReconstructionResult(
        model=model,
        albedo_jpg=_encode_jpg(baked.albedo, 92),
        smooth_jpg=_encode_jpg(smooth, 88),
        mask_png=_encode_png(mask),
        thumbnail_jpg=_encode_jpg(thumbnail, 88),
        stats={"seconds": round(time.perf_counter() - started, 2), "atlasSize": atlas_size},
    )
    progress(1.0, "finishing")
    return result


def _thumbnail(rgb: np.ndarray, analysis: PhotoAnalysis, size: int = 512) -> np.ndarray:
    h, w = rgb.shape[:2]
    x, y, bw, bh = analysis.face_box or (0.25, 0.25, 0.5, 0.5)
    cx, cy = (x + bw / 2) * w, (y + bh / 2) * h
    side = max(bw * w, bh * h) * 1.45
    x0, y0 = int(round(cx - side / 2)), int(round(cy - side / 2))
    x1, y1 = int(round(cx + side / 2)), int(round(cy + side / 2))
    pad = max(0, -x0, -y0, x1 - w, y1 - h)
    if pad:
        rgb = cv2.copyMakeBorder(rgb, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
        x0, y0, x1, y1 = x0 + pad, y0 + pad, x1 + pad, y1 + pad
    return cv2.resize(rgb[y0:y1, x0:x1], (size, size), interpolation=cv2.INTER_AREA)


def _encode_jpg(rgb: np.ndarray, quality: int) -> bytes:
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("jpeg encoding failed")
    return buf.tobytes()


def _encode_png(gray: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", gray)
    if not ok:
        raise RuntimeError("png encoding failed")
    return buf.tobytes()
