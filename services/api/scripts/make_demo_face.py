#!/usr/bin/env python3
"""
Generates the bundled demo face used by the app before a user has scanned (and in
demo mode): the canonical MediaPipe face with a soft painted "porcelain clay" texture.
It is intentionally stylised rather than a real person.

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

from app.reconstruction.texture import (  # noqa: E402
    AtlasRaster,
    atlas_uvs,
    mean_skin_color,
    skin_mask,
    smooth_skin,
    uv_to_pixels,
)
from app.reconstruction.topology import (  # noqa: E402
    LANDMARK_COUNT,
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

BASE = np.array([236, 214, 202], np.float32)  # porcelain
BLUSH = np.array([226, 168, 160], np.float32)
LIP = np.array([205, 132, 132], np.float32)
BROW = np.array([150, 118, 104], np.float32)
LASH = np.array([96, 72, 66], np.float32)
IRIS = np.array([112, 86, 76], np.float32)


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
    img += (noise / (np.abs(noise).max() + 1e-6))[..., None] * 5

    for apple in ([50, 101, 36, 205, 118], [280, 330, 266, 425, 347]):
        c = uv[apple].mean(0)
        blush = np.zeros((SIZE, SIZE), np.float32)
        cv2.circle(blush, tuple(np.round(c).astype(int)), int(SIZE * 0.055), 1.0, -1, cv2.LINE_AA)
        img = _mix(img, BLUSH, cv2.GaussianBlur(blush, (0, 0), SIZE * 0.035) * 0.35)

    img = _mix(img, LIP, _soft_polygon(uv[LIPS_OUTER], blur=2.6) * 0.62)
    for brow in (RIGHT_BROW, LEFT_BROW):
        img = _mix(img, BROW, _soft_polygon(uv[brow], blur=4.0, dilate=1) * 0.32)
    for eye in (RIGHT_EYE, LEFT_EYE):
        opening = _soft_polygon(uv[eye], blur=1.4)
        img = _mix(img, np.array([242, 234, 229], np.float32), opening * 0.55)
        # A soft painted iris, clipped by the eyelids.
        centre = uv[eye].mean(0)
        height = uv[eye][:, 1].max() - uv[eye][:, 1].min()
        iris = np.zeros((SIZE, SIZE), np.float32)
        iris_centre = tuple(np.round(centre - [0, height * 0.08]).astype(int))
        cv2.circle(iris, iris_centre, int(height * 0.42), 1.0, -1, cv2.LINE_AA)
        img = _mix(img, IRIS, cv2.GaussianBlur(iris, (0, 0), 1.2) * opening * 0.85)
        upper = uv[eye[:9]]  # outer corner -> upper lid -> inner corner
        img = _mix(img, LASH, _soft_line(upper, max(2, SIZE // 400), 1.4) * 0.6)
    return np.clip(img, 0, 255).astype(np.uint8)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.mkdir(parents=True, exist_ok=True)
    face = canonical_face()
    albedo = paint_albedo()
    raster = AtlasRaster(SIZE)
    albedo[~raster.coverage] = BASE.astype(np.uint8)
    mask = skin_mask(512)
    smooth = smooth_skin(albedo, 512)

    model = {
        "format": "beautymade.face-model",
        "version": 1,
        "mesh": {
            "positions": [round(float(x), 4) for x in face.positions.reshape(-1)],
            "uvs": [round(float(x), 5) for x in atlas_uvs().reshape(-1)],
            "indices": face.triangles.reshape(-1).tolist(),
            "landmarkCount": LANDMARK_COUNT,
        },
        "atlasSize": SIZE,
        "skinTone": mean_skin_color(albedo, mask),
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
