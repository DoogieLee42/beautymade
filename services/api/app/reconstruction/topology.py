"""Canonical MediaPipe face topology shared with the mobile app (@beautymade/face-engine)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

DATA_DIR = Path(__file__).parent / "data"
LANDMARK_COUNT = 468

# Ordered landmark loops. "Right"/"left" are from the subject's point of view,
# so the right eye appears on the left of a (non-mirrored) photo.
RIGHT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
LEFT_EYE = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
RIGHT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
LEFT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
RIGHT_NOSTRIL = [98, 97, 2, 326, 327]  # nostril base line; used with a small dilation

# Landmarks that barely move with expressions; used for rigid alignment between views.
_STABLE_FOREHEAD = [10, 151, 9, 108, 337, 67, 297, 109, 338]
_STABLE_NOSE = [168, 6, 197, 195, 5, 4, 1, 64, 294, 98, 327]
_STABLE_EYES = [33, 133, 263, 362]
_STABLE_CHEEKS = [116, 345, 123, 352, 50, 280, 234, 454, 127, 356, 21, 251]
STABLE = _STABLE_FOREHEAD + _STABLE_NOSE + _STABLE_EYES + _STABLE_CHEEKS


@dataclass(frozen=True)
class CanonicalFace:
    positions: np.ndarray  # (468, 3): +x subject's left, +y up, +z towards the viewer
    uvs: np.ndarray  # (468, 2) in [0, 1], v up
    triangles: np.ndarray  # (898, 3), counter-clockwise seen from the front
    oval: list[int]  # boundary loop


@lru_cache(maxsize=1)
def canonical_face() -> CanonicalFace:
    positions: list[list[float]] = []
    uvs_raw: list[list[float]] = []
    faces: list[list[tuple[int, int]]] = []
    for line in (DATA_DIR / "canonical_face_model.obj").read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            positions.append([float(x) for x in parts[1:4]])
        elif parts[0] == "vt":
            uvs_raw.append([float(x) for x in parts[1:3]])
        elif parts[0] == "f":
            faces.append([tuple(int(i) - 1 for i in p.split("/")[:2]) for p in parts[1:4]])  # type: ignore[misc]

    uv_index = {v: t for face in faces for v, t in face}
    pos = np.asarray(positions, dtype=np.float64)
    uvs = np.asarray([uvs_raw[uv_index[v]] for v in range(len(pos))], dtype=np.float64)
    tris = np.asarray([[v for v, _ in face] for face in faces], dtype=np.int32)

    # Orient counter-clockwise when seen from +z (same rule as scripts/gen_canonical_topology.py).
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    signed = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    if signed.sum() < 0:
        tris = tris[:, [0, 2, 1]]

    return CanonicalFace(positions=pos, uvs=uvs, triangles=tris, oval=_boundary_loop(tris))


def _boundary_loop(tris: np.ndarray) -> list[int]:
    edges: dict[tuple[int, int], int] = {}
    for a, b, c in tris.tolist():
        for e in ((a, b), (b, c), (c, a)):
            key = (min(e), max(e))
            edges[key] = edges.get(key, 0) + 1
    adj: dict[int, list[int]] = {}
    for (a, b), n in edges.items():
        if n == 1:
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    start = 10
    loop, prev, cur = [start], -1, start
    while True:
        nxt = [n for n in adj[cur] if n != prev]
        step = nxt[0] if prev >= 0 else max(adj[cur])
        if step == start:
            return loop
        loop.append(step)
        prev, cur = cur, step


def vertex_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """Area-weighted per-vertex normals."""
    a, b, c = positions[triangles[:, 0]], positions[triangles[:, 1]], positions[triangles[:, 2]]
    face_n = np.cross(b - a, c - a)
    normals = np.zeros_like(positions)
    for k in range(3):
        np.add.at(normals, triangles[:, k], face_n)
    norm = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.maximum(norm, 1e-12)


def triangle_adjacency(triangles: np.ndarray, vertex_count: int) -> np.ndarray:
    """Boolean (T, T) matrix: triangles that share at least one vertex (including itself)."""
    t = len(triangles)
    incidence = np.zeros((vertex_count, t), dtype=bool)
    for k in range(3):
        incidence[triangles[:, k], np.arange(t)] = True
    return (incidence.T.astype(np.uint8) @ incidence.astype(np.uint8)) > 0
