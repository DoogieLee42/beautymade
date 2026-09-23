"""
Completes the fused face into a full head.

The bundled template (skull, ears and neck from the CC0 MakeHuman base mesh, see
scripts/build_head_template.py) is fitted around each scanned face: a per-axis scale
follows the face's proportions and a local, compactly supported warp makes the template
meet the face border exactly. A thin band of triangles stitches the face border to the
template's opening.

Vertex layout of the assembled mesh (the app receives the same order, minus the band):
  [0, 468)            face landmarks (canonical MediaPipe topology)
  [468, 468 + M)      template shell
  [468 + M, +36)      duplicates of the 36 border landmarks, textured in the head chart
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .topology import DATA_DIR, LANDMARK_COUNT, canonical_face

WARP_RADIUS = 5.0  # cm; the template is only reshaped this close to the face
BLEND_ZONE = 4.5  # cm; template region re-shaped so it continues the face surface
BAND_WIDTH = (0.45, 1.1)  # cm; allowed gap between the face border and the template opening


@dataclass(frozen=True)
class HeadTemplate:
    shell_positions: np.ndarray  # (M, 3) canonical frame
    shell_uvs: np.ndarray  # (M, 2) head chart
    shell_triangles: np.ndarray  # (T, 3) shell-local indices
    shell_hair: np.ndarray  # (M,)
    shell_ear: np.ndarray  # (M,)
    weld: np.ndarray  # (K, 2) shell-local [duplicate, original]
    rim: np.ndarray  # (R,) shell-local, same direction as `oval`
    oval: np.ndarray  # (36,) landmark indices
    ring_uvs: np.ndarray  # (36, 2) head chart


@lru_cache(maxsize=1)
def head_template() -> HeadTemplate:
    data = np.load(DATA_DIR / "head_template.npz")
    return HeadTemplate(
        shell_positions=data["shell_positions"].astype(np.float64),
        shell_uvs=data["shell_uvs"].astype(np.float64),
        shell_triangles=data["shell_triangles"].astype(np.int64),
        shell_hair=data["shell_hair"].astype(np.float64),
        shell_ear=data["shell_ear"].astype(np.float64),
        weld=data["weld"].astype(np.int64),
        rim=data["rim"].astype(np.int64),
        oval=data["oval"].astype(np.int64),
        ring_uvs=data["ring_uvs"].astype(np.float64),
    )


@dataclass
class HeadMesh:
    positions: np.ndarray  # (V, 3)
    face_uvs: np.ndarray  # (V, 2) face-chart UV (meaningful for face vertices)
    head_uvs: np.ndarray  # (V, 2) head-chart UV (meaningful for shell and ring vertices)
    face_triangles: np.ndarray  # (898, 3)
    head_triangles: np.ndarray  # (T + band, 3): shell and band, textured in the head chart
    band_start: int  # first band triangle within head_triangles
    weld: np.ndarray  # (K, 2) global [duplicate, original]
    hair: np.ndarray  # (V,) 1 on the scalp
    hair_allowed: np.ndarray  # (V,) bool: photo pixels of hair may be used here (not hanging over ears/neck)
    shell_start: int
    ring_start: int

    @property
    def triangles(self) -> np.ndarray:
        return np.concatenate([self.face_triangles, self.head_triangles])

    def representative(self) -> np.ndarray:
        """Index of the vertex each vertex is welded to (itself when not a duplicate)."""
        rep = np.arange(len(self.positions))
        rep[self.weld[:, 0]] = self.weld[:, 1]
        return rep

    def normals(self) -> np.ndarray:
        """Area-weighted normals shared across welded duplicates."""
        rep = self.representative()
        tris = rep[self.triangles]
        p = self.positions
        n = np.cross(p[tris[:, 1]] - p[tris[:, 0]], p[tris[:, 2]] - p[tris[:, 0]])
        acc = np.zeros_like(p)
        for k in range(3):
            np.add.at(acc, tris[:, k], n)
        acc = acc[rep]
        return acc / np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)

    def shell_payload(self) -> dict:
        """What the app needs to rebuild the band after subdividing the face (see face-engine)."""
        t = head_template()
        return {
            "oval": t.oval.tolist(),
            "rim": (t.rim + self.shell_start).tolist(),
            "ringUvs": [round(float(x), 5) for x in t.ring_uvs.reshape(-1)],
            "weld": (t.weld + self.shell_start).reshape(-1).tolist(),
        }


def fit_head(face_positions: np.ndarray) -> HeadMesh:
    """Fits the template around a fused face (canonical frame) and stitches them together."""
    t = head_template()
    canon = canonical_face()
    src = canon.positions

    # 1. Per-axis scale (and shift) so the skull follows the face's width, height and depth.
    scale, shift = _axis_fit(src, face_positions)
    shell = t.shell_positions * scale + shift
    # 2. Local warp: interpolate the remaining landmark residuals, fading out within WARP_RADIUS.
    centers = src * scale + shift
    shell = shell + _wendland_warp(centers, face_positions - centers, shell, WARP_RADIUS)

    # 3. Make the template's opening continue the face surface beyond its border.
    shell = shell + _continue_face(face_positions, shell)

    m = len(shell)
    shell_start = LANDMARK_COUNT
    ring_start = shell_start + m
    ring = face_positions[t.oval]
    positions = np.concatenate([face_positions, shell, ring])

    face_uvs = np.zeros((len(positions), 2))
    face_uvs[:LANDMARK_COUNT] = canon.uvs
    head_uvs = np.zeros((len(positions), 2))
    head_uvs[shell_start:ring_start] = t.shell_uvs
    head_uvs[ring_start:] = t.ring_uvs

    ring_ids = np.arange(ring_start, ring_start + len(t.oval))
    rim_ids = t.rim + shell_start
    band = _zip_loops(ring_ids, rim_ids, positions)
    band = _orient_outward(band, positions)
    head_triangles = np.concatenate([t.shell_triangles + shell_start, band])

    weld = np.concatenate([t.weld + shell_start, np.stack([ring_ids, t.oval], 1)])
    hair = np.zeros(len(positions))
    hair[shell_start:ring_start] = t.shell_hair
    ear = np.zeros(len(positions))
    ear[shell_start:ring_start] = t.shell_ear
    # Hair belongs above the ears; below them (cheeks, jaw, neck) it is hair hanging down.
    ear_top = face_positions[[234, 454], 1].mean() + 3.2
    hair_allowed = (positions[:, 1] > ear_top) & (ear < 0.5)
    return HeadMesh(
        positions=positions,
        face_uvs=face_uvs,
        head_uvs=head_uvs,
        face_triangles=canon.triangles.astype(np.int64),
        head_triangles=head_triangles,
        band_start=len(t.shell_triangles),
        weld=weld,
        hair=hair,
        hair_allowed=hair_allowed,
        shell_start=shell_start,
        ring_start=ring_start,
    )


@lru_cache(maxsize=1)
def _shell_graph() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Welded shell connectivity: representative per vertex and unique neighbour pairs."""
    t = head_template()
    rep = np.arange(len(t.shell_positions))
    rep[t.weld[:, 0]] = t.weld[:, 1]
    tris = rep[t.shell_triangles]
    pairs = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    pairs = np.unique(np.sort(pairs, axis=1), axis=0)
    rows = np.concatenate([pairs[:, 0], pairs[:, 1]])
    cols = np.concatenate([pairs[:, 1], pairs[:, 0]])
    return rep, rows, cols


@lru_cache(maxsize=1)
def _oval_inner_neighbours() -> list[np.ndarray]:
    """For each border landmark, the adjacent landmarks inside the face."""
    face = canonical_face()
    oval = set(face.oval)
    neighbours: dict[int, set[int]] = {v: set() for v in face.oval}
    for tri in face.triangles.tolist():
        for v in tri:
            if v in neighbours:
                neighbours[v].update(u for u in tri if u not in oval)
    return [np.asarray(sorted(neighbours[v])) for v in face.oval]


def _continue_face(face_positions: np.ndarray, shell: np.ndarray) -> np.ndarray:
    """
    Displacement of the template so that its opening sits just beyond the face border,
    along the direction the face surface is heading there (G1-like join), blended back
    to the template's own shape within BLEND_ZONE.
    """
    t = head_template()
    oval_pts = face_positions[t.oval]
    n = len(t.oval)

    # Outward tangent of the face surface at every border landmark.
    tangents = np.zeros((n, 3))
    for k, inner in enumerate(_oval_inner_neighbours()):
        along = oval_pts[(k + 1) % n] - oval_pts[k - 1]
        along /= np.linalg.norm(along)
        out = oval_pts[k] - face_positions[inner].mean(0)
        out -= along * (out @ along)
        tangents[k] = out / max(np.linalg.norm(out), 1e-9)

    # Closest point on the border polyline for every template vertex.
    a, b = oval_pts, np.roll(oval_pts, -1, axis=0)
    seg = b - a
    rel = shell[:, None] - a[None]
    tt = np.clip((rel * seg[None]).sum(2) / (seg * seg).sum(1)[None], 0, 1)
    closest = a[None] + tt[..., None] * seg[None]
    dist = np.linalg.norm(shell[:, None] - closest, axis=2)
    k = dist.argmin(1)
    ti = tt[np.arange(len(shell)), k]
    q = closest[np.arange(len(shell)), k]
    tangent = tangents[k] * (1 - ti)[:, None] + tangents[(k + 1) % n] * ti[:, None]
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    d = dist[np.arange(len(shell)), k]

    # Rim targets: continue the face surface by the (clamped) current gap.
    rim = t.rim
    target = q[rim] + tangent[rim] * np.clip(d[rim], *BAND_WIDTH)[:, None]
    fixed = np.zeros(len(shell), dtype=bool)
    delta = np.zeros_like(shell)
    fixed[rim] = True
    delta[rim] = target - shell[rim]
    fixed[d > BLEND_ZONE] = True  # far away: keep the template's shape

    # Harmonic blend of the displacement over the welded shell graph (Jacobi iterations).
    rep, rows, cols = _shell_graph()
    reps = np.unique(rep)
    fixed_rep = np.zeros(len(shell), dtype=bool)
    np.logical_or.at(fixed_rep, rep, fixed)
    value = np.zeros_like(shell)
    value[rep[fixed]] = delta[fixed]
    degree = np.bincount(rows, minlength=len(shell)).astype(np.float64)
    free = reps[~fixed_rep[reps]]
    for _ in range(200):
        acc = np.zeros_like(shell)
        np.add.at(acc, rows, value[cols])
        value[free] = acc[free] / np.maximum(degree[free], 1)[:, None]
    return value[rep]


def _axis_fit(src: np.ndarray, dst: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Least-squares dst ≈ src * scale + shift, per axis, with the scale kept plausible."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s0, d0 = src - mu_s, dst - mu_d
    scale = np.clip((s0 * d0).sum(0) / np.maximum((s0 * s0).sum(0), 1e-9), 0.85, 1.18)
    return scale, mu_d - mu_s * scale


def _wendland(r: np.ndarray) -> np.ndarray:
    """Wendland C2 kernel: smooth, positive definite in 3D, zero beyond r = 1."""
    r = np.clip(r, 0.0, 1.0)
    return (1 - r) ** 4 * (4 * r + 1)


def _wendland_warp(centers: np.ndarray, values: np.ndarray, points: np.ndarray, radius: float) -> np.ndarray:
    """Displacements at `points` from a radial basis interpolant of `values` at `centers`."""
    d = np.linalg.norm(centers[:, None] - centers[None], axis=2) / radius
    kernel = _wendland(d) + 1e-6 * np.eye(len(centers))
    weights = np.linalg.solve(kernel, values)
    out = np.zeros_like(points)
    for s in range(0, len(points), 1024):
        p = points[s : s + 1024]
        k = _wendland(np.linalg.norm(p[:, None] - centers[None], axis=2) / radius)
        out[s : s + 1024] = k @ weights
    return out


def _zip_loops(a: np.ndarray, b: np.ndarray, positions: np.ndarray) -> np.ndarray:
    """Triangle strip between two closed loops running in the same direction, starting side by side."""
    na, nb = len(a), len(b)
    i = j = 0
    tris = []
    while i < na or j < nb:
        ai, ai1 = a[i % na], a[(i + 1) % na]
        bj, bj1 = b[j % nb], b[(j + 1) % nb]
        advance_a = j >= nb or (
            i < na and np.linalg.norm(positions[ai1] - positions[bj]) <= np.linalg.norm(positions[ai] - positions[bj1])
        )
        if advance_a:
            tris.append([ai, ai1, bj])
            i += 1
        else:
            tris.append([ai, bj1, bj])
            j += 1
    return np.asarray(tris, dtype=np.int64)


def _orient_outward(tris: np.ndarray, positions: np.ndarray) -> np.ndarray:
    """Flips the strip if most of its triangles face into the head."""
    p = positions
    n = np.cross(p[tris[:, 1]] - p[tris[:, 0]], p[tris[:, 2]] - p[tris[:, 0]])
    centre = np.array([0.0, 1.0, -5.5])
    outward = (p[tris].mean(1) - centre) * [1.0, 0.4, 1.0]
    if (np.einsum("ij,ij->i", n, outward) < 0).mean() > 0.5:
        return tris[:, [0, 2, 1]]
    return tris
