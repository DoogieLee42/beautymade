#!/usr/bin/env python3
"""
Generates the bundled demo face used by the app before a user has scanned (and in
demo mode): the canonical MediaPipe face on the head template, as a porcelain bust (the
app lights it like a studio sculpture). It is intentionally stylised rather than a real
person.

Usage (from services/api):  .venv/bin/python scripts/make_demo_face.py [out_dir]
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.reconstruction.head import fit_head  # noqa: E402
from app.reconstruction.pipeline import _mesh_payload  # noqa: E402
from app.reconstruction.texture import (  # noqa: E402
    AtlasRaster,
    atlas_uvs,
    head_skin_mask,
    mean_skin_color,
    skin_mask,
    smooth_skin,
    uv_to_pixels,
)
from app.reconstruction.topology import (  # noqa: E402
    LEFT_BROW,
    LEFT_EYE,
    LIPS_OUTER,
    RIGHT_BROW,
    RIGHT_EYE,
    canonical_face,
)

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT = ROOT / "apps" / "mobile" / "assets" / "demo-face"
TEXTURES_TS = ROOT / "apps" / "mobile" / "src" / "three" / "demoFaceTextures.generated.ts"
SIZE = 1024

BASE = np.array([238, 232, 227], np.float32)  # warm porcelain
BLUSH = np.array([232, 212, 206], np.float32)
LIP = np.array([214, 184, 180], np.float32)
BROW = np.array([192, 180, 172], np.float32)
LASH = np.array([150, 136, 130], np.float32)
HAIR = np.array([212, 203, 196], np.float32)  # a hint of sculpted hair on the scalp


def _soft_polygon(points: np.ndarray, blur: float, dilate: int = 0) -> np.ndarray:
    mask = np.zeros((SIZE, SIZE), np.uint8)
    cv2.fillPoly(mask, [np.round(points).astype(np.int32)], 255)
    if dilate:
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1)))
    k = int(blur * 6) | 1
    return cv2.GaussianBlur(mask, (k, k), blur).astype(np.float32) / 255.0


def _soft_line(points: np.ndarray, width: int, blur: float) -> np.ndarray:
    mask = np.zeros((SIZE, SIZE), np.uint8)
    cv2.polylines(mask, [np.round(points).astype(np.int32)], False, 255, width, cv2.LINE_AA)
    k = int(blur * 6) | 1
    return cv2.GaussianBlur(mask, (k, k), blur).astype(np.float32) / 255.0


def _mix(img: np.ndarray, color: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return img * (1 - alpha[..., None]) + color * alpha[..., None]


def paint_albedo() -> np.ndarray:
    uv = uv_to_pixels(atlas_uvs(), SIZE)
    rng = np.random.default_rng(7)
    img = np.ones((SIZE, SIZE, 3), np.float32) * BASE
    # Very subtle low-frequency tone variation so the surface does not look like plastic.
    noise = cv2.GaussianBlur(rng.normal(0, 1, (SIZE, SIZE)).astype(np.float32), (0, 0), 24)
    img += (noise / (np.abs(noise).max() + 1e-6))[..., None] * 3

    for apple in ([50, 101, 36, 205, 118], [280, 330, 266, 425, 347]):
        c = uv[apple].mean(0)
        blush = np.zeros((SIZE, SIZE), np.float32)
        cv2.circle(blush, tuple(np.round(c).astype(int)), int(SIZE * 0.055), 1.0, -1, cv2.LINE_AA)
        img = _mix(img, BLUSH, cv2.GaussianBlur(blush, (0, 0), SIZE * 0.035) * 0.3)

    img = _mix(img, LIP, _soft_polygon(uv[LIPS_OUTER], blur=3.0) * 0.55)
    for brow in (RIGHT_BROW, LEFT_BROW):
        img = _mix(img, BROW, _soft_polygon(uv[brow], blur=5.0, dilate=1) * 0.35)
    for eye in (RIGHT_EYE, LEFT_EYE):
        upper = uv[eye[:9]]  # outer corner -> upper lid -> inner corner
        img = _mix(img, LASH, _soft_line(upper, max(2, SIZE // 420), 1.8) * 0.45)
    return np.clip(img, 0, 255).astype(np.uint8)


def paint_head(head) -> np.ndarray:
    """Porcelain for the head chart, slightly deeper where hair would be."""
    raster = AtlasRaster(SIZE, head.head_uvs, head.head_triangles)
    hair = raster.scatter(raster.interpolate(head.hair).astype(np.float32))
    rng = np.random.default_rng(11)
    noise = cv2.GaussianBlur(rng.normal(0, 1, (SIZE, SIZE)).astype(np.float32), (0, 0), 18)
    noise = (noise / (np.abs(noise).max() + 1e-6))[..., None]
    img = BASE * (1 - hair[..., None] * 0.6) + HAIR * (hair[..., None] * 0.6) + noise * (2 + 4 * hair[..., None])
    img[~raster.coverage] = BASE
    return np.clip(img, 0, 255).astype(np.uint8)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.mkdir(parents=True, exist_ok=True)
    face = canonical_face()
    head = fit_head(face.positions)
    face_albedo = paint_albedo()
    face_albedo[~AtlasRaster(SIZE).coverage] = BASE.astype(np.uint8)
    albedo = np.concatenate([face_albedo, paint_head(head)], axis=1)
    face_mask = skin_mask(512)
    mask = np.concatenate([face_mask, head_skin_mask(512, head.head_uvs, head.head_triangles, head.hair)], axis=1)
    smooth = smooth_skin(albedo, (1024, 512))

    model = {
        "format": "beautymade.face-model",
        "version": 2,
        "mesh": _mesh_payload(head),
        "atlasSize": SIZE,
        "atlas": {"width": albedo.shape[1], "height": albedo.shape[0]},
        "skinTone": mean_skin_color(face_albedo, face_mask),
    }
    (out / "model.json").write_text(json.dumps(model, separators=(",", ":")))

    # Textures are embedded as data URLs, which load the same way on iOS, Android and web.
    def data_url(ext: str, img: np.ndarray, mime: str, params: list[int]) -> str:
        ok, buf = cv2.imencode(ext, img, params)
        assert ok
        return f"data:{mime};base64," + base64.b64encode(buf.tobytes()).decode()

    albedo_url = data_url(".jpg", cv2.cvtColor(albedo, cv2.COLOR_RGB2BGR), "image/jpeg", [cv2.IMWRITE_JPEG_QUALITY, 90])
    smooth_url = data_url(".jpg", cv2.cvtColor(smooth, cv2.COLOR_RGB2BGR), "image/jpeg", [cv2.IMWRITE_JPEG_QUALITY, 88])
    mask_url = data_url(".png", mask, "image/png", [])
    TEXTURES_TS.write_text(
        "// AUTO-GENERATED by services/api/scripts/make_demo_face.py. Do not edit by hand.\n"
        "export const DEMO_TEXTURES = {\n"
        f"  albedo: '{albedo_url}',\n"
        f"  smooth: '{smooth_url}',\n"
        f"  mask: '{mask_url}',\n"
        "};\n"
    )
    print(f"demo face written to {out / 'model.json'} and {TEXTURES_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
