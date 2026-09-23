"""
Builds the head template that completes a scanned face into a full head.

Source: the MakeHuman "hm08" base mesh, released as CC0 (public domain dedication) in 2020.
It is downloaded once (pinned by SHA-256), aligned to the MediaPipe canonical face, the face
region is cut out and what remains (skull, ears, neck) becomes the "shell" that the
reconstruction pipeline attaches around every scanned face.

Output: app/reconstruction/data/head_template.npz

  shell_positions (M,3) float32   head surface around the face, canonical face frame (cm)
  shell_uvs       (M,2) float32   head-chart UVs in [0,1]² (v up)
  shell_triangles (T,3) int32     counter-clockwise seen from outside, indices into the shell
  shell_hair      (M,)  float32   1 where hair grows (scalp), 0 on skin (ears, neck, temples)
  shell_ear       (M,)  float32   1 on the ears
  weld            (K,2) int32     [duplicate, original] shell vertices split along texture seams
  rim             (R,)  int32     shell vertices around the face opening, same direction as `oval`
  oval            (36,) int32     the canonical face's border landmarks, in order
  ring_uvs        (36,2) float32  head-chart UV of each oval landmark (the face-to-head band)

Run from services/api:  uv run python scripts/build_head_template.py [--debug-dir DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.reconstruction.geometry import Similarity, umeyama  # noqa: E402
from app.reconstruction.topology import LEFT_EYE, RIGHT_EYE, canonical_face  # noqa: E402

BASE_MESH_URL = "https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj"
BASE_MESH_SHA256 = "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c"
CACHE = ROOT / ".models" / "makehuman-base.obj"
OUTPUT = ROOT / "app" / "reconstruction" / "data" / "head_template.npz"

NECK_CUT_Y = -17.0  # canonical cm; keeps the neck, drops the shoulders
FACE_DEPTH = 2.2  # template vertices this close to the canonical face (and inside its border) are "face"
BORDER_KEEP = 0.35  # ...unless they project within this distance of the face border
UV_MARGIN = 0.012


# ------------------------------------------------------------------------------ input


def fetch_base_mesh() -> Path:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {BASE_MESH_URL}")
        with urllib.request.urlopen(BASE_MESH_URL, timeout=120) as resp:
            CACHE.write_bytes(resp.read())
    digest = hashlib.sha256(CACHE.read_bytes()).hexdigest()
    if digest != BASE_MESH_SHA256:
        raise SystemExit(f"unexpected base mesh (sha256 {digest}); delete {CACHE} and check the source")
    return CACHE


class MakeHuman:
    def __init__(self, path: Path) -> None:
        positions, uvs, quads, quad_uvs, groups = [], [], [], [], []
        group = ""
        for line in path.read_text().splitlines():
            if line.startswith("v "):
                positions.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f "):
                corners = [p.split("/") for p in line.split()[1:]]
                quads.append([int(c[0]) - 1 for c in corners])
                quad_uvs.append([int(c[1]) - 1 for c in corners])
                groups.append(group)
        self.positions = np.asarray(positions, dtype=np.float64)
        self.uvs = np.asarray(uvs, dtype=np.float64)
        self.quads = quads
        self.quad_uvs = quad_uvs
        self.groups = groups

    def joint(self, name: str) -> np.ndarray:
        ids = sorted({i for q, g in zip(self.quads, self.groups, strict=True) if g == name for i in q})
        return self.positions[ids].mean(0)

    def body(self) -> tuple[np.ndarray, np.ndarray]:
        keep = [k for k, g in enumerate(self.groups) if g == "body"]
        return np.asarray([self.quads[k] for k in keep]), np.asarray([self.quad_uvs[k] for k in keep])


# ------------------------------------------------------------------------------ geometry helpers


def nearest(points: np.ndarray, targets: np.ndarray, chunk: int = 256) -> tuple[np.ndarray, np.ndarray]:
    """Index of and distance to the nearest target for every point (brute force, chunked)."""
    idx = np.empty(len(points), dtype=np.int64)
    dist = np.empty(len(points))
    t2 = (targets**2).sum(1)
    for s in range(0, len(points), chunk):
        p = points[s : s + chunk]
        d2 = (p**2).sum(1)[:, None] - 2 * p @ targets.T + t2[None]
        k = d2.argmin(1)
        idx[s : s + chunk] = k
        dist[s : s + chunk] = np.sqrt(np.maximum(d2[np.arange(len(p)), k], 0))
    return idx, dist


def triangulate(quads: np.ndarray, positions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Splits each quad along its shorter diagonal. Returns triangle corner indices into the quad (0-3)."""
    p = positions[quads]
    d02 = np.linalg.norm(p[:, 0] - p[:, 2], axis=1)
    d13 = np.linalg.norm(p[:, 1] - p[:, 3], axis=1)
    use02 = d02 <= d13
    corners = np.where(use02[:, None, None], [[0, 1, 2], [0, 2, 3]], [[0, 1, 3], [1, 2, 3]])
    rows = np.repeat(np.arange(len(quads)), 2)
    return rows, corners.reshape(-1, 3)


def closest_point_on_triangles(points: np.ndarray, tri_pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For each point: index of the closest triangle and barycentric coordinates on it."""
    best_t = np.zeros(len(points), dtype=np.int64)
    best_b = np.zeros((len(points), 3))
    best_d = np.full(len(points), np.inf)
    for t, (a, b, c) in enumerate(tri_pts):
        bary = _closest_bary(points, a, b, c)
        q = bary[:, :1] * a + bary[:, 1:2] * b + bary[:, 2:] * c
        d = np.linalg.norm(points - q, axis=1)
        better = d < best_d
        best_d[better], best_t[better], best_b[better] = d[better], t, bary[better]
    return best_t, best_b


def _closest_bary(p: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    # Project onto the plane, clamp into the triangle by sampling the edges when outside.
    ab, ac = b - a, c - a
    d00, d01, d11 = ab @ ab, ab @ ac, ac @ ac
    den = d00 * d11 - d01 * d01 or 1e-12
    ap = p - a
    d20, d21 = ap @ ab, ap @ ac
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    bary = np.stack([1 - v - w, v, w], 1)
    outside = (bary < 0).any(1)
    if outside.any():
        cand = []
        for x, y, i, j in ((a, b, 0, 1), (b, c, 1, 2), (c, a, 2, 0)):
            e = y - x
            t = np.clip(((p[outside] - x) @ e) / max(e @ e, 1e-12), 0, 1)
            q = x + t[:, None] * e
            bb = np.zeros((outside.sum(), 3))
            bb[:, i], bb[:, j] = 1 - t, t
            cand.append((np.linalg.norm(p[outside] - q, axis=1), bb))
        dists = np.stack([c_[0] for c_ in cand])
        pick = dists.argmin(0)
        bary[outside] = np.stack([c_[1] for c_ in cand])[pick, np.arange(outside.sum())]
    return bary


# ------------------------------------------------------------------------------ steps


def align_to_canonical(mh: MakeHuman, head_vertices: np.ndarray) -> Similarity:
    """MakeHuman (decimetres, +z forward) -> canonical face frame (cm), via eyes/nose/chin then ICP."""
    face = canonical_face()
    canon = face.positions
    head = mh.positions[head_vertices]
    midline = np.abs(head[:, 0]) < 0.15
    nose_region = head[midline & (head[:, 1] > 6.4) & (head[:, 1] < 7.2)]
    nose = nose_region[nose_region[:, 2].argmax()]
    chin_region = head[(np.abs(head[:, 0]) < 0.1) & (head[:, 2] > 0.9) & (head[:, 1] < 6.6)]
    chin = chin_region[chin_region[:, 1].argmin()]
    # The eye joints sit in the eyeball centres, about 1.1 cm behind the canonical lid loops.
    src = np.stack([mh.joint("joint-r-eye"), mh.joint("joint-l-eye"), nose, chin])
    behind = np.array([0, 0, 1.1])
    dst = np.stack([canon[RIGHT_EYE].mean(0) - behind, canon[LEFT_EYE].mean(0) - behind, canon[1], canon[152]])
    transform = umeyama(src, dst)

    # ICP: pull the template's front surface onto the canonical landmarks (similarity only).
    points = transform.apply(head)
    front = points[:, 2] > -3
    for _ in range(30):
        idx, dist = nearest(canon, points[front])
        weights = np.exp(-((dist / 1.5) ** 2))
        step = umeyama(points[front][idx], canon, weights)
        points = step.apply(points)
        transform = Similarity(
            scale=step.scale * transform.scale,
            rotation=step.rotation @ transform.rotation,
            translation=step.scale * step.rotation @ transform.translation + step.translation,
        )
    idx, dist = nearest(canon, points[front])
    border = dist[face.oval]
    print(f"alignment: mean {dist.mean():.2f} cm, border {border.mean():.2f} cm (max {border.max():.2f})")
    return transform


def face_region_vertices(positions: np.ndarray, candidates: np.ndarray) -> np.ndarray:
    """Template vertices lying on (or just behind) the canonical face, away from its border."""
    face = canonical_face()
    canon, tris, oval = face.positions, face.triangles, face.oval
    steps = 6
    grid = [(i, j) for i in range(steps + 1) for j in range(steps + 1 - i)]
    bary = np.array([(i / steps, j / steps, 1 - (i + j) / steps) for i, j in grid])
    samples = np.concatenate([bary @ canon[t] for t in tris])
    seg_a, seg_b = canon[oval], canon[np.roll(oval, -1)]
    border = np.full(len(samples), np.inf)
    for a, b in zip(seg_a, seg_b, strict=True):
        e = b - a
        t = np.clip(((samples - a) @ e) / (e @ e), 0, 1)
        border = np.minimum(border, np.linalg.norm(samples - (a + t[:, None] * e), axis=1))
    idx, dist = nearest(positions[candidates], samples)
    return candidates[(dist < FACE_DEPTH) & (border[idx] > BORDER_KEEP)]


def largest_component(quads: np.ndarray) -> np.ndarray:
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for q in quads:
        root = find(int(q[0]))
        for v in q[1:]:
            parent[find(int(v))] = root
    roots = [find(int(q[0])) for q in quads]
    main = Counter(roots).most_common(1)[0][0]
    return np.asarray([r == main for r in roots])


def boundary_loops(triangles: np.ndarray) -> list[list[int]]:
    use: Counter[tuple[int, int]] = Counter()
    for a, b, c in triangles.tolist():
        for e in ((a, b), (b, c), (c, a)):
            use[(min(e), max(e))] += 1
    adj: dict[int, list[int]] = defaultdict(list)
    for (a, b), n in use.items():
        if n == 1:
            adj[a].append(b)
            adj[b].append(a)
    if any(len(v) != 2 for v in adj.values()):
        raise SystemExit("shell boundary is not manifold")
    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], -1, start
        seen.add(start)
        while True:
            nxt = adj[cur][0] if adj[cur][0] != prev else adj[cur][1]
            if nxt == start:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        loops.append(loop)
    return loops


def signed_area_xy(points: np.ndarray) -> float:
    x, y = points[:, 0], points[:, 1]
    return float(0.5 * (x * np.roll(y, -1) - np.roll(x, -1) * y).sum())


def uv_islands(tri_uv: np.ndarray) -> np.ndarray:
    """Island id per triangle, connecting triangles that share a UV vertex."""
    parent = np.arange(tri_uv.max() + 1)

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, c in tri_uv:
        ra = find(a)
        parent[find(b)] = ra
        parent[find(c)] = ra
    roots = np.array([find(t[0]) for t in tri_uv])
    _, ids = np.unique(roots, return_inverse=True)
    return ids


def pack_islands(uv: np.ndarray, tri_uv: np.ndarray, island: np.ndarray) -> list[tuple[float, np.ndarray]]:
    """
    Places the islands in [0,1]²: the largest (the head) fills a left column at full height,
    the others are stacked in the remaining column at the same texel density when they fit.
    Returns (scale, offset) per island, applied as uv * scale + offset.
    """
    count = island.max() + 1
    boxes = []
    for i in range(count):
        pts = uv[np.unique(tri_uv[island == i])]
        boxes.append((pts.min(0), pts.max(0)))
    order = sorted(range(count), key=lambda i: -np.prod(boxes[i][1] - boxes[i][0]))
    head = order[0]
    lo, hi = boxes[head]
    scale = (1 - 2 * UV_MARGIN) / (hi[1] - lo[1])
    transforms: list[tuple[float, np.ndarray]] = [(0.0, np.zeros(2))] * count
    transforms[head] = (scale, np.array([UV_MARGIN, UV_MARGIN]) - lo * scale)
    x0 = UV_MARGIN * 2 + (hi[0] - lo[0]) * scale
    column = 1 - UV_MARGIN - x0
    y = 1 - UV_MARGIN
    for i in order[1:]:
        lo_i, hi_i = boxes[i]
        size = hi_i - lo_i
        s = min(scale, column / size[0])
        y -= size[1] * s
        if y < UV_MARGIN:
            raise SystemExit("UV islands do not fit the head chart")
        transforms[i] = (s, np.array([x0, y]) - lo_i * s)
        y -= UV_MARGIN
    return transforms


EAR_CENTRE = np.array([8.4, 1.0, -5.6])
EAR_RADII = np.array([2.6, 4.4, 3.4])


def ear_weight(positions: np.ndarray) -> np.ndarray:
    """1 on the ears, fading to 0 just around them."""
    weight = np.zeros(len(positions))
    for side in (-1, 1):
        d = np.linalg.norm((positions - EAR_CENTRE * [side, 1, 1]) / EAR_RADII, axis=1)
        weight = np.maximum(weight, np.clip((1.15 - d) / 0.3, 0, 1))
    return weight.astype(np.float32)


def hair_weight(positions: np.ndarray) -> np.ndarray:
    """1 on the scalp (where hair grows), 0 on the ears, neck and temples; smooth in between."""
    centre_z = -5.5
    theta = np.degrees(np.abs(np.arctan2(positions[:, 0], positions[:, 2] - centre_z)))
    # Typical hairline height by angle around the head (0 = forehead, 180 = nape).
    knots_theta = [0, 25, 50, 70, 88, 105, 130, 155, 180]
    knots_y = [9.3, 8.6, 7.0, 5.4, 5.8, 5.2, 0.5, -5.5, -8.5]
    hairline = np.interp(theta, knots_theta, knots_y)
    t = np.clip((positions[:, 1] - hairline) / 1.6 + 0.5, 0, 1)
    weight = t * t * (3 - 2 * t)
    # Ears are skin.
    weight *= 1 - ear_weight(positions)
    return weight.astype(np.float32)


# ------------------------------------------------------------------------------ main


def build(debug_dir: Path | None = None) -> dict[str, np.ndarray]:
    mh = MakeHuman(fetch_base_mesh())
    quads, quad_uvs = mh.body()

    # Head and neck, aligned to the canonical face.
    rough = np.array([mh.positions[q][:, 1].min() > 5.2 for q in quads])
    transform = align_to_canonical(mh, np.unique(quads[rough]))
    positions = transform.apply(mh.positions)
    keep = np.array([positions[q][:, 1].min() > NECK_CUT_Y for q in quads])
    quads, quad_uvs = quads[keep], quad_uvs[keep]

    # Cut out the face (MediaPipe provides it) and anything left floating inside it.
    face_vertices = set(face_region_vertices(positions, np.unique(quads)).tolist())
    is_face = np.array([any(int(v) in face_vertices for v in q) for q in quads])
    face_quads, face_quad_uvs = quads[is_face], quad_uvs[is_face]
    quads, quad_uvs = quads[~is_face], quad_uvs[~is_face]
    main = largest_component(quads)
    quads, quad_uvs = quads[main], quad_uvs[main]

    rows, corners = triangulate(quads, positions)
    tri_pos = quads[rows[:, None], corners]
    tri_uv = quad_uvs[rows[:, None], corners]

    # Outward orientation (MakeHuman winds its quads counter-clockwise from outside; verify).
    a, b, c = (positions[tri_pos[:, k]] for k in range(3))
    normals = np.cross(b - a, c - a)
    centre = np.array([0.0, 2.0, -5.5])
    if (np.einsum("ij,ij->i", normals, (a + b + c) / 3 - centre) < 0).mean() > 0.5:
        tri_pos, tri_uv = tri_pos[:, [0, 2, 1]], tri_uv[:, [0, 2, 1]]

    # Shell vertices: one per (position, uv) pair; duplicates along texture seams get welded.
    pairs = np.unique(np.stack([tri_pos.reshape(-1), tri_uv.reshape(-1)], 1), axis=0)
    vertex_of = {(int(p), int(t)): i for i, (p, t) in enumerate(pairs)}
    corners = zip(tri_pos.reshape(-1).tolist(), tri_uv.reshape(-1).tolist(), strict=True)
    triangles = np.array([vertex_of[corner] for corner in corners]).reshape(-1, 3)
    shell_pos_index = pairs[:, 0]
    first_copy: dict[int, int] = {}
    weld = []
    for i, p in enumerate(shell_pos_index.tolist()):
        if p in first_copy:
            weld.append((i, first_copy[p]))
        else:
            first_copy[p] = i

    # Head chart layout.
    island = uv_islands(tri_uv)
    transforms = pack_islands(mh.uvs, tri_uv, island)
    shell_uvs = np.zeros((len(pairs), 2))
    for t, tri in enumerate(triangles):
        s, off = transforms[island[t]]
        shell_uvs[tri] = mh.uvs[pairs[tri, 1]] * s + off
    head_island = int(np.bincount(island).argmax())
    head_scale, head_offset = transforms[head_island]

    # Rim of the face opening, as shell vertices in the head island, oriented like the oval.
    face = canonical_face()
    oval = np.asarray(face.oval)
    loops = boundary_loops(tri_pos)
    rim_positions = min(loops, key=lambda loop: np.linalg.norm(positions[loop].mean(0) - face.positions[oval].mean(0)))
    head_vertex = {}
    for t, tri in enumerate(triangles):
        if island[t] == head_island:
            for v in tri:
                head_vertex.setdefault(int(shell_pos_index[v]), int(v))
    rim = np.array([head_vertex[p] for p in rim_positions])
    if np.sign(signed_area_xy(positions[rim_positions])) != np.sign(signed_area_xy(face.positions[oval])):
        rim = rim[::-1]
    start = int(np.linalg.norm(positions[shell_pos_index[rim]] - face.positions[oval[0]], axis=1).argmin())
    rim = np.roll(rim, -start)

    # Head-chart UV of every oval landmark: closest point on the removed face quads.
    frows, fcorners = triangulate(face_quads, positions)
    ftri_pos = face_quads[frows[:, None], fcorners]
    ftri_uv = face_quad_uvs[frows[:, None], fcorners]
    tri_idx, bary = closest_point_on_triangles(face.positions[oval], positions[ftri_pos])
    ring_uvs = (mh.uvs[ftri_uv[tri_idx]] * bary[..., None]).sum(1) * head_scale + head_offset

    shell_positions = positions[shell_pos_index]
    gaps = np.linalg.norm(shell_positions[rim][:, None] - face.positions[oval][None], axis=2).min(1)
    print(f"shell: {len(shell_positions)} vertices, {len(triangles)} triangles, {len(weld)} seam duplicates")
    print(f"rim: {len(rim)} vertices, gap to the face border {gaps.min():.2f}-{gaps.max():.2f} cm")

    data = {
        "shell_positions": shell_positions.astype(np.float32),
        "shell_uvs": shell_uvs.astype(np.float32),
        "shell_triangles": triangles.astype(np.int32),
        "shell_hair": hair_weight(shell_positions),
        "shell_ear": ear_weight(shell_positions),
        "weld": np.asarray(weld, dtype=np.int32).reshape(-1, 2),
        "rim": rim.astype(np.int32),
        "oval": oval.astype(np.int32),
        "ring_uvs": ring_uvs.astype(np.float32),
    }
    if debug_dir:
        _debug_images(data, debug_dir)
    return data


def _debug_images(data: dict[str, np.ndarray], out: Path) -> None:
    import cv2

    out.mkdir(parents=True, exist_ok=True)
    size = 900
    img = np.full((size, size, 3), 255, np.uint8)
    uv = data["shell_uvs"]
    px = np.stack([uv[:, 0] * size, (1 - uv[:, 1]) * size], 1)
    for tri, h in zip(data["shell_triangles"], data["shell_hair"][data["shell_triangles"]].mean(1), strict=True):
        cv2.fillConvexPoly(img, np.round(px[tri]).astype(np.int32), (int(90 + 120 * (1 - h)), 150, int(90 + 120 * h)))
        cv2.polylines(img, [np.round(px[tri]).astype(np.int32)], True, (70, 70, 70), 1)
    ring = np.stack([data["ring_uvs"][:, 0] * size, (1 - data["ring_uvs"][:, 1]) * size], 1)
    cv2.polylines(img, [np.round(ring).astype(np.int32)], True, (0, 160, 0), 2)
    cv2.polylines(img, [np.round(px[data["rim"]]).astype(np.int32)], True, (0, 0, 220), 2)
    cv2.imwrite(str(out / "head_uv.png"), img)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--debug-dir", type=Path, default=None)
    args = parser.parse_args()
    data = build(args.debug_dir)
    np.savez_compressed(OUTPUT, **data)
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
