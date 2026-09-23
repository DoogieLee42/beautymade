"""Test fixtures: a real frontal face photo and synthetic side views rendered from it."""

from __future__ import annotations

import math
from functools import lru_cache

import cv2
import numpy as np

from app.reconstruction.topology import vertex_normals


@lru_cache(maxsize=1)
def front_photo() -> np.ndarray:
    """scikit-image's public-domain astronaut photo, cropped to the face and upscaled (RGB)."""
    from skimage import data

    img = data.astronaut()
    cx, cy, half = int(0.44 * 512), int(0.25 * 512), 120
    crop = img[max(cy - half, 0) : cy + half, cx - half : cx + half]
    big = cv2.resize(crop, (960, 960), interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(big, (0, 0), 3)
    return cv2.addWeighted(big, 1.6, blur, -0.6, 0)  # unsharp mask, like a phone photo


def render_view(model: dict, albedo_rgb: np.ndarray, yaw_deg: float, size: int = 960) -> np.ndarray:
    """Software-renders the textured head turned by `yaw_deg` (positive = to the subject's left)."""
    positions = np.array(model["mesh"]["positions"]).reshape(-1, 3)
    uvs = np.array(model["mesh"]["uvs"]).reshape(-1, 2)
    tris = np.array(model["mesh"]["indices"]).reshape(-1, 3)
    head = model["mesh"].get("head")
    if head:
        # The app stitches the face to the head itself; do the same here.
        from app.reconstruction.head import _orient_outward, _zip_loops

        oval, rim = np.array(head["oval"]), np.array(head["rim"])
        ring = np.arange(len(positions), len(positions) + len(oval))
        positions = np.concatenate([positions, positions[oval]])
        uvs = np.concatenate([uvs, np.array(head["ringUvs"]).reshape(-1, 2)])
        tris = np.concatenate([tris, _orient_outward(_zip_loops(ring, rim, positions), positions)])
    tex_h, tex_w = albedo_rgb.shape[:2]
    uv_px = np.stack([uvs[:, 0] * tex_w, (1 - uvs[:, 1]) * tex_h], 1).astype(np.float32)

    a = math.radians(yaw_deg)
    rot = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    pts = positions @ rot.T
    scale = size / 25.0
    # Render on a larger canvas (the head and neck overflow the frame) and crop like a photo.
    pad = size // 2
    canvas = size + 2 * pad
    xy = np.stack([pts[:, 0] * scale + canvas / 2, -pts[:, 1] * scale + canvas / 2], 1).astype(np.float32)
    img = np.full((canvas, canvas, 3), (118, 112, 108), np.uint8)
    _ = vertex_normals(pts, tris)
    for t in np.argsort(pts[tris].mean(1)[:, 2]):
        tri = tris[t]
        e1, e2 = xy[tri[1]] - xy[tri[0]], xy[tri[2]] - xy[tri[0]]
        if e1[0] * e2[1] - e1[1] * e2[0] > 0:  # back-facing (image y points down)
            continue
        dst = xy[tri]
        x0, y0 = np.clip(np.floor(dst.min(0)).astype(int), 0, canvas - 1)
        x1, y1 = np.clip(np.ceil(dst.max(0)).astype(int) + 1, 0, canvas)
        if x1 <= x0 or y1 <= y0:
            continue
        m = cv2.getAffineTransform(uv_px[tri], (dst - [x0, y0]).astype(np.float32))
        patch = cv2.warpAffine(albedo_rgb, m, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
        cv2.fillConvexPoly(mask, np.round((dst - [x0, y0]) * 8).astype(np.int32), 255, cv2.LINE_AA, 3)
        roi = img[y0:y1, x0:x1]
        alpha = mask[..., None] / 255.0
        roi[:] = (roi * (1 - alpha) + patch * alpha).astype(np.uint8)
    return img[pad : pad + size, pad : pad + size].copy()


def encode_jpg(rgb: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return buf.tobytes()


@lru_cache(maxsize=1)
def three_views() -> dict[str, bytes]:
    """Front photo plus left/right views synthesised from a front-only reconstruction."""
    from app.reconstruction.pipeline import reconstruct

    front = front_photo()
    base = reconstruct({"front": front})
    albedo = cv2.cvtColor(cv2.imdecode(np.frombuffer(base.albedo_jpg, np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    return {
        "front": encode_jpg(front),
        "left": encode_jpg(render_view(base.model, albedo, 35)),
        "right": encode_jpg(render_view(base.model, albedo, -35)),
    }
