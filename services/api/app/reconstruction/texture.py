"""Bakes the captured photos into one texture atlas laid out in the canonical UV space."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .topology import (
    LEFT_BROW,
    LEFT_EYE,
    LIPS_OUTER,
    RIGHT_BROW,
    RIGHT_EYE,
    canonical_face,
    triangle_adjacency,
    vertex_normals,
)

ATLAS_MARGIN = 0.02


@dataclass
class ViewTexture:
    name: str
    image: np.ndarray  # RGB uint8
    pixels: np.ndarray  # (468, 2) landmark positions in image pixels
    toward_camera: np.ndarray  # (3,) unit vector from the face towards this camera, face frame
    depth: np.ndarray  # (468,) distance towards the camera, larger = nearer
    preference: float = 1.0


def atlas_uvs() -> np.ndarray:
    """UVs used by generated models: the canonical layout with a small padding margin."""
    return ATLAS_MARGIN + (1 - 2 * ATLAS_MARGIN) * canonical_face().uvs


def uv_to_pixels(uvs: np.ndarray, size: int) -> np.ndarray:
    return np.stack([uvs[:, 0] * size, (1 - uvs[:, 1]) * size], axis=1)


class AtlasRaster:
    """Which triangle covers each atlas texel, and where inside it (barycentric)."""

    def __init__(self, size: int) -> None:
        face = canonical_face()
        self.size = size
        self.triangles = face.triangles
        uv_px = uv_to_pixels(atlas_uvs(), size)
        ids = np.zeros((size, size), dtype=np.uint16)
        shift = 4
        for t, tri in enumerate(self.triangles):
            poly = np.round(uv_px[tri] * (1 << shift) - 0.5 * (1 << shift)).astype(np.int32)
            cv2.fillConvexPoly(ids, poly, t + 1, lineType=cv2.LINE_8, shift=shift)
        ys, xs = np.nonzero(ids)
        self.texel_y, self.texel_x = ys, xs
        self.tri_id = ids[ys, xs].astype(np.int32) - 1
        self.bary = _barycentric(np.stack([xs + 0.5, ys + 0.5], 1), uv_px, self.triangles[self.tri_id])
        self.coverage = ids > 0

    def interpolate(self, per_vertex: np.ndarray) -> np.ndarray:
        """Barycentric interpolation of a per-vertex attribute at every covered texel."""
        tri = self.triangles[self.tri_id]
        vals = per_vertex[tri]  # (N, 3, D) or (N, 3)
        if vals.ndim == 2:
            return (vals * self.bary).sum(1)
        return (vals * self.bary[..., None]).sum(1)

    def scatter(self, values: np.ndarray, fill: float = 0.0) -> np.ndarray:
        shape = (self.size, self.size) + values.shape[1:]
        out = np.full(shape, fill, dtype=values.dtype)
        out[self.texel_y, self.texel_x] = values
        return out


def _barycentric(p: np.ndarray, verts: np.ndarray, tris: np.ndarray) -> np.ndarray:
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    v0, v1, v2 = b - a, c - a, p - a
    d00 = (v0 * v0).sum(1)
    d01 = (v0 * v1).sum(1)
    d11 = (v1 * v1).sum(1)
    d20 = (v2 * v0).sum(1)
    d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-12] = 1e-12
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    bary = np.stack([1 - v - w, v, w], 1)
    bary = np.clip(bary, 0, 1)
    return bary / bary.sum(1, keepdims=True)


def _visibility(view: ViewTexture, raster: AtlasRaster, map_xy: np.ndarray, adjacency: np.ndarray) -> np.ndarray:
    """Z-buffer test: a texel is visible if the front-most triangle at its image position is (next to) its own."""
    h, w = view.image.shape[:2]
    down = 2
    ids = np.zeros((h // down + 1, w // down + 1), dtype=np.uint16)
    tris = raster.triangles
    order = np.argsort(view.depth[tris].mean(1))  # far to near; nearer triangles overwrite
    shift = 3
    for t in order:
        poly = np.round(view.pixels[tris[t]] / down * (1 << shift)).astype(np.int32)
        cv2.fillConvexPoly(ids, poly, int(t) + 1, lineType=cv2.LINE_8, shift=shift)
    px = np.clip((map_xy[:, 0] / down).astype(np.int32), 0, ids.shape[1] - 1)
    py = np.clip((map_xy[:, 1] / down).astype(np.int32), 0, ids.shape[0] - 1)
    front = ids[py, px].astype(np.int32) - 1
    visible = np.zeros(len(front), dtype=bool)
    hit = front >= 0
    visible[hit] = adjacency[raster.tri_id[hit], front[hit]]
    return visible


@dataclass
class BakeResult:
    albedo: np.ndarray  # RGB uint8 (size, size, 3)
    weights: dict[str, float]  # share of the atlas each view contributed


def bake_atlas(views: list[ViewTexture], normals: np.ndarray, size: int) -> BakeResult:
    """
    Warps every photo into the atlas (piecewise-affine per triangle, via the landmarks),
    picks the best view per texel (facing the camera, unoccluded), equalises exposure
    between views and merges them with multi-band blending so seams disappear.
    """
    raster = AtlasRaster(size)
    face = canonical_face()
    adjacency = triangle_adjacency(face.triangles, len(face.positions))
    n = len(raster.tri_id)

    samples, scores = [], []
    for view in views:
        map_xy = raster.interpolate(view.pixels).astype(np.float32)
        h, w = view.image.shape[:2]
        # Landmark pixels are continuous coordinates; OpenCV samples pixel centres at integers.
        warped = cv2.remap(
            view.image,
            raster.scatter(map_xy[:, 0] - 0.5, fill=-1.0),
            raster.scatter(map_xy[:, 1] - 0.5, fill=-1.0),
            cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )
        colors = warped[raster.texel_y, raster.texel_x]
        facing = np.clip(raster.interpolate(normals @ view.toward_camera), 0, 1)
        inside = (map_xy[:, 0] >= 1) & (map_xy[:, 0] < w - 1) & (map_xy[:, 1] >= 1) & (map_xy[:, 1] < h - 1)
        visible = _visibility(view, raster, map_xy, adjacency) if len(views) > 1 else np.ones(n, bool)
        score = (facing**3) * view.preference * inside * visible
        samples.append(colors.astype(np.float32))
        scores.append(score)

    scores_arr = np.stack(scores)  # (V, N)
    samples_arr = np.stack(samples)  # (V, N, 3)
    best = scores_arr.argmax(0)
    best[scores_arr.max(0) <= 1e-6] = 0  # nothing sees it well: fall back to the front photo

    # Exposure / white balance: match every view to the front photo on shared, well-seen texels.
    for v in range(1, len(views)):
        both = (scores_arr[0] > 0.3) & (scores_arr[v] > 0.3)
        if both.sum() > 500:
            gain = np.median(samples_arr[0][both], 0) / np.maximum(np.median(samples_arr[v][both], 0), 1)
            samples_arr[v] *= np.clip(gain, 0.7, 1.4)

    albedo = _multiband_blend(raster, samples_arr, best, len(views))
    albedo = _fill_background(albedo, raster.coverage)
    share = {view.name: float((best == i).mean()) for i, view in enumerate(views)}
    return BakeResult(albedo=albedo, weights=share)


def _multiband_blend(raster: AtlasRaster, samples: np.ndarray, best: np.ndarray, count: int) -> np.ndarray:
    size = raster.size
    if count == 1:
        return np.clip(raster.scatter(samples[0]), 0, 255).astype(np.uint8)
    levels = 5
    blended_pyr = None
    weight_total = None
    for v in range(count):
        img = raster.scatter(samples[v])
        img = _fill_background(np.clip(img, 0, 255).astype(np.uint8), raster.coverage).astype(np.float32)
        # Texels outside the face belong to the front photo so every pyramid level has weight.
        mask = raster.scatter((best == v).astype(np.float32), fill=1.0 if v == 0 else 0.0)
        lap = _laplacian_pyramid(img, levels)
        gauss = _gaussian_pyramid(mask, levels)
        if blended_pyr is None:
            blended_pyr = [lp * g[..., None] for lp, g in zip(lap, gauss, strict=True)]
            weight_total = [g.copy() for g in gauss]
        else:
            for i in range(levels):
                blended_pyr[i] += lap[i] * gauss[i][..., None]
                weight_total[i] += gauss[i]
    assert blended_pyr is not None and weight_total is not None
    for i in range(levels):
        blended_pyr[i] /= np.maximum(weight_total[i], 1e-6)[..., None]
    out = blended_pyr[-1]
    for i in range(levels - 2, -1, -1):
        out = cv2.pyrUp(out, dstsize=(blended_pyr[i].shape[1], blended_pyr[i].shape[0])) + blended_pyr[i]
    out = cv2.resize(out, (size, size)) if out.shape[0] != size else out
    return np.clip(out, 0, 255).astype(np.uint8)


def _gaussian_pyramid(img: np.ndarray, levels: int) -> list[np.ndarray]:
    pyr = [img]
    for _ in range(levels - 1):
        pyr.append(cv2.pyrDown(pyr[-1]))
    return pyr


def _laplacian_pyramid(img: np.ndarray, levels: int) -> list[np.ndarray]:
    gauss = _gaussian_pyramid(img, levels)
    lap = []
    for i in range(levels - 1):
        up = cv2.pyrUp(gauss[i + 1], dstsize=(gauss[i].shape[1], gauss[i].shape[0]))
        lap.append(gauss[i] - up)
    lap.append(gauss[-1])
    return lap


def _fill_background(img: np.ndarray, coverage: np.ndarray) -> np.ndarray:
    """Extends edge colours outwards (push-pull) so texture filtering never samples black."""
    out = img.copy()
    known = coverage.copy()
    small, small_known = out.astype(np.float32), known.astype(np.float32)
    pyramid = []
    while small.shape[0] > 8:
        pyramid.append((small, small_known))
        k = small_known[..., None]
        num = cv2.pyrDown(small * k)
        den = cv2.pyrDown(small_known)
        small = num / np.maximum(den, 1e-6)[..., None]
        small_known = (den > 1e-3).astype(np.float32)
    fill = small
    for level, level_known in reversed(pyramid):
        fill = cv2.resize(fill, (level.shape[1], level.shape[0]), interpolation=cv2.INTER_LINEAR)
        fill = np.where(level_known[..., None] > 0.5, level, fill)
    return np.where(known[..., None], out, np.clip(fill, 0, 255).astype(np.uint8))


def skin_mask(size: int) -> np.ndarray:
    """Soft mask of skin in atlas space (no eyes, brows or lips), uint8."""
    uv_px = uv_to_pixels(atlas_uvs(), size)
    raster = AtlasRaster(size)
    mask = raster.coverage.astype(np.uint8) * 255
    # Keep the skin clear of the face border, where the geometry fades out anyway.
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=max(1, size // 256))
    exclusions = ((RIGHT_EYE, 0.018), (LEFT_EYE, 0.018), (RIGHT_BROW, 0.012), (LEFT_BROW, 0.012), (LIPS_OUTER, 0.008))
    for loop, grow in exclusions:
        poly = np.round(uv_px[loop]).astype(np.int32)
        region = np.zeros_like(mask)
        cv2.fillPoly(region, [poly], 255)
        radius = max(1, int(grow * size))
        region = cv2.dilate(region, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1)))
        mask[region > 0] = 0
    blur = max(3, int(size * 0.02)) | 1
    return cv2.GaussianBlur(mask, (blur, blur), 0)


def smooth_skin(albedo: np.ndarray, size: int) -> np.ndarray:
    """Edge-preserving smoothed version of the atlas, used by the skin-smoothing slider."""
    img = cv2.resize(albedo, (size, size), interpolation=cv2.INTER_AREA) if albedo.shape[0] != size else albedo
    out = img
    for _ in range(2):
        out = cv2.bilateralFilter(out, d=0, sigmaColor=22, sigmaSpace=max(3, size // 160))
    # Blend in a gentle low-pass to even out blotches that survive the bilateral filter.
    low = cv2.GaussianBlur(out, (0, 0), sigmaX=size / 220)
    return cv2.addWeighted(out, 0.7, low, 0.3, 0)


def mean_skin_color(albedo: np.ndarray, mask: np.ndarray) -> list[float]:
    m = cv2.resize(mask, (albedo.shape[1], albedo.shape[0])) > 200
    if m.sum() < 100:
        return [0.8, 0.65, 0.58]
    return [round(float(c) / 255.0, 4) for c in np.median(albedo[m], 0)]


def canonical_normals() -> np.ndarray:
    face = canonical_face()
    return vertex_normals(face.positions, face.triangles)
