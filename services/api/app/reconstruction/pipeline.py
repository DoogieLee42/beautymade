"""
Photos -> 3D face model.

  1. analyse    MediaPipe landmarks + pose/quality per photo
  2. shape      rigidly align the views and fuse their landmarks into one 3D shape
  3. head       fit the head template (skull, ears, neck) around the fused face
  4. texture    bake the photos into a face chart and a head chart (visibility-aware,
                multi-band blended; the head uses hair/skin segmentation)
  5. finish     skin mask, smoothed skin texture, thumbnail, eye measurements and eyeball
                texture, model.json

The texture is two square charts side by side: the face (canonical MediaPipe layout) on
the left, the rest of the head on the right. The mobile app subdivides the face, stitches
it to the head and applies the beauty deformations on-device, so this service only has
to produce the base mesh and textures.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import cv2
import numpy as np

from .eyeball import build_eye_texture
from .eyes import eye_frame, measure_eyes
from .geometry import ViewGeometry, fuse_views, head_pose, to_camera_space
from .head import HeadMesh, fit_head
from .landmarker import FaceLandmarker, shared_landmarker
from .quality import VIEWS, PhotoAnalysis, View, analyze_photo
from .segmenter import HAIR, SelfieSegmenter, shared_segmenter
from .texture import (
    BakeMesh,
    Chart,
    HeadFill,
    ViewTexture,
    atlas_uvs,
    bake_chart,
    head_skin_mask,
    mean_skin_color,
    skin_mask,
    smooth_skin,
)
from .topology import LANDMARK_COUNT, triangle_adjacency

log = logging.getLogger(__name__)

MODEL_FORMAT = "beautymade.face-model"
MODEL_VERSION = 2
CHART_SIZE = 1024  # each chart; the texture is two charts wide

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
    eyes_jpg: bytes | None = None  # the clean eyeball atlas, when the eyes could be measured


def _noop(_: float, __: str) -> None:
    pass


def reconstruct(
    photos: dict[View, np.ndarray],
    progress: ProgressFn = _noop,
    landmarker: FaceLandmarker | None = None,
    segmenter: SelfieSegmenter | None = None,
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

    # 3. head -------------------------------------------------------------------------------
    head = fit_head(positions)
    progress(0.55, "shaping")

    # 4. texture ----------------------------------------------------------------------------
    progress(0.58, "texturing")
    segmentation = _segment({v: photos[v] for v in analyses}, segmenter)
    rep = head.representative()
    triangles = head.triangles
    mesh = BakeMesh(
        triangles=triangles,
        normals=head.normals(),
        adjacency=triangle_adjacency(rep[triangles], len(head.positions)),
    )
    view_textures = []
    for geom in fused.views:
        a = analyses[geom.name]  # type: ignore[index]
        landmark_px = a.detection.landmarks[:LANDMARK_COUNT, :2] * [a.width, a.height]  # type: ignore[union-attr]
        camera_space = geom.to_face.invert(head.positions)
        view_textures.append(
            ViewTexture(
                name=geom.name,
                image=photos[geom.name],  # type: ignore[index]
                pixels=_vertex_pixels(head, landmark_px, camera_space),
                toward_camera=geom.to_face.rotation[:, 2],
                depth=camera_space[:, 2],
                preference=2.0 if geom.name == "front" else 1.0,
                segmentation=segmentation.get(geom.name),  # type: ignore[arg-type]
            )
        )
    front_analysis = analyses["front"]

    n_face = len(head.face_triangles)
    face_uvs = np.zeros((len(head.positions), 2))
    face_uvs[:LANDMARK_COUNT] = atlas_uvs()
    face_bake = bake_chart(view_textures, mesh, Chart(uvs=face_uvs, triangles=np.arange(n_face)), CHART_SIZE)
    progress(0.75, "texturing")

    face_mask = skin_mask(CHART_SIZE // 2)
    skin_rgb = np.asarray(mean_skin_color(face_bake.albedo, face_mask)) * 255
    hair_rgb = _hair_color(photos["front"], segmentation.get("front"), front_analysis, skin_rgb)
    head_chart = Chart(
        uvs=head.head_uvs,
        triangles=np.arange(n_face, len(triangles)),
        fill=HeadFill(hair=head.hair, hair_allowed=head.hair_allowed, skin_rgb=skin_rgb, hair_rgb=hair_rgb),
    )
    head_bake = bake_chart(view_textures, mesh, head_chart, CHART_SIZE)
    albedo = np.concatenate([face_bake.albedo, head_bake.albedo], axis=1)
    progress(0.85, "texturing")

    # 5. finish -----------------------------------------------------------------------------
    progress(0.9, "finishing")
    head_tris = head.head_triangles
    mask = np.concatenate(
        [face_mask, head_skin_mask(CHART_SIZE // 2, head.head_uvs, head_tris, head.hair)], axis=1
    )
    smooth = smooth_skin(albedo, (albedo.shape[1], albedo.shape[0]))
    thumbnail = _thumbnail(photos["front"], front_analysis)
    front_landmarks = front_analysis.detection.landmarks  # type: ignore[union-attr]
    eyes = measure_eyes(front_landmarks, front_analysis.width, front_analysis.height)
    eye_texture = None
    if eyes is not None:
        front_geom = next(g for g in fused.views if g.name == "front")
        eye_texture = build_eye_texture(
            photos["front"],
            eye_frame(front_landmarks, front_analysis.width, front_analysis.height),  # type: ignore[arg-type]
            head.positions[:LANDMARK_COUNT],
            lambda points: _project(front_geom, points),
        )

    views_meta = {}
    for geom in fused.views:
        pose = head_pose(geom.to_face)
        views_meta[geom.name] = {
            "yaw": round(pose.yaw, 1),
            "pitch": round(pose.pitch, 1),
            "roll": round(pose.roll, 1),
            "textureShare": round(face_bake.weights.get(geom.name, 0.0), 3),
        }
    skipped = [v for v in photos if v not in analyses]
    model = {
        "format": MODEL_FORMAT,
        "version": MODEL_VERSION,
        "mesh": _mesh_payload(head),
        "atlasSize": CHART_SIZE,
        "atlas": {"width": albedo.shape[1], "height": albedo.shape[0]},
        "skinTone": [round(float(c) / 255.0, 4) for c in skin_rgb],
        "eyes": eyes,
        "eyeTexture": (
            {"width": eye_texture.size[0], "height": eye_texture.size[1], **eye_texture.maps} if eye_texture else None
        ),
        "views": views_meta,
        "quality": {
            "viewsUsed": list(analyses.keys()),
            "viewsSkipped": skipped,
            "multiViewResidual": round(fused.residual, 4),
            "headFill": round(head_bake.weights.get("fill", 0.0), 3),
        },
    }
    result = ReconstructionResult(
        model=model,
        albedo_jpg=_encode_jpg(albedo, 92),
        smooth_jpg=_encode_jpg(smooth, 88),
        mask_png=_encode_png(mask),
        thumbnail_jpg=_encode_jpg(thumbnail, 88),
        stats={"seconds": round(time.perf_counter() - started, 2), "atlasSize": CHART_SIZE},
        eyes_jpg=_encode_jpg(eye_texture.image, 92) if eye_texture else None,
    )
    progress(1.0, "finishing")
    return result


def face_chart_to_atlas(uvs: np.ndarray) -> np.ndarray:
    return uvs * [0.5, 1.0]


def head_chart_to_atlas(uvs: np.ndarray) -> np.ndarray:
    return uvs * [0.5, 1.0] + [0.5, 0.0]


def _mesh_payload(head: HeadMesh) -> dict:
    """Face landmarks + head shell (the app rebuilds the face-to-head band itself)."""
    n = head.ring_start
    uvs = np.concatenate([face_chart_to_atlas(atlas_uvs()), head_chart_to_atlas(head.head_uvs[head.shell_start : n])])
    shell = head.head_triangles[: head.band_start]
    shell_info = head.shell_payload()
    ring_uvs = head_chart_to_atlas(np.asarray(shell_info["ringUvs"]).reshape(-1, 2))
    shell_info["ringUvs"] = [round(float(x), 5) for x in ring_uvs.reshape(-1)]
    return {
        "positions": [round(float(x), 4) for x in head.positions[:n].reshape(-1)],
        "uvs": [round(float(x), 5) for x in uvs.reshape(-1)],
        "indices": np.concatenate([head.face_triangles, shell]).reshape(-1).tolist(),
        "landmarkCount": LANDMARK_COUNT,
        "head": shell_info,
    }


def _project(view: ViewGeometry, points: np.ndarray) -> np.ndarray:
    """Model-space points -> pixels of that view's photo, through the fitted pose."""
    camera = view.to_face.invert(points)
    return np.stack([camera[:, 0], -camera[:, 1]], axis=1)


def _vertex_pixels(head: HeadMesh, landmark_px: np.ndarray, camera_space: np.ndarray) -> np.ndarray:
    """
    Image position of every vertex. Face landmarks use what the detector saw; the head is
    projected through the fitted pose, carrying the border's detection-vs-model offset
    into its surroundings so the face and head textures meet without a step.
    """
    from .head import head_template

    projected = np.stack([camera_space[:, 0], -camera_space[:, 1]], axis=1)
    pixels = projected.copy()
    pixels[:LANDMARK_COUNT] = landmark_px
    oval = head_template().oval
    residual = landmark_px[oval] - projected[oval]
    shell = slice(head.shell_start, head.ring_start)
    d = np.linalg.norm(head.positions[shell][:, None] - head.positions[oval][None], axis=2)
    w = np.exp(-((d / 2.5) ** 2))
    w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    reach = np.clip(1 - d.min(1) / 6.0, 0, 1) ** 2
    pixels[shell] += reach[:, None] * (w @ residual)
    pixels[head.ring_start :] = landmark_px[oval]
    return pixels


def _segment(photos: dict[View, np.ndarray], segmenter: SelfieSegmenter | None) -> dict[str, np.ndarray]:
    """Hair/skin/background per photo; an empty result just disables the head's photo filtering."""
    try:
        seg = segmenter or shared_segmenter()
        return {view: seg.segment(img) for view, img in photos.items()}
    except Exception:  # noqa: BLE001 - the head can always fall back to fill colours
        log.exception("segmentation failed")
        return {}


def _hair_color(
    rgb: np.ndarray, segmentation: np.ndarray | None, analysis: PhotoAnalysis, fallback: np.ndarray
) -> np.ndarray:
    """Typical hair colour around the face in the front photo (skin tone when no hair is visible)."""
    if segmentation is None:
        return fallback
    h, w = rgb.shape[:2]
    x, y, bw, bh = analysis.face_box or (0.2, 0.2, 0.6, 0.6)
    x0, x1 = int(max(0, (x - bw * 0.6) * w)), int(min(w, (x + bw * 1.6) * w))
    y0, y1 = int(max(0, (y - bh * 0.8) * h)), int(min(h, (y + bh * 1.2) * h))
    region = segmentation[y0:y1, x0:x1] == HAIR
    if region.sum() < 0.03 * region.size:
        return fallback
    return np.median(rgb[y0:y1, x0:x1][region], 0).astype(np.float64)


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
