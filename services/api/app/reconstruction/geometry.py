"""Rigid alignment, head pose and multi-view fusion of MediaPipe landmarks."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .topology import LANDMARK_COUNT, STABLE, canonical_face, vertex_normals


@dataclass(frozen=True)
class Similarity:
    """dst ≈ scale * R @ src + t"""

    scale: float
    rotation: np.ndarray  # (3, 3)
    translation: np.ndarray  # (3,)

    def apply(self, points: np.ndarray) -> np.ndarray:
        return self.scale * points @ self.rotation.T + self.translation

    def invert(self, points: np.ndarray) -> np.ndarray:
        return ((points - self.translation) @ self.rotation) / self.scale


@dataclass(frozen=True)
class HeadPose:
    """Degrees. yaw > 0: the subject turned to their left; pitch > 0: chin up."""

    yaw: float
    pitch: float
    roll: float


def to_camera_space(landmarks: np.ndarray, width: int, height: int) -> np.ndarray:
    """Normalised MediaPipe landmarks -> right-handed pixel-scaled points (x right, y up, z to camera)."""
    pts = landmarks[:LANDMARK_COUNT]
    return np.stack([pts[:, 0] * width, -pts[:, 1] * height, -pts[:, 2] * width], axis=1)


def umeyama(src: np.ndarray, dst: np.ndarray, weights: np.ndarray | None = None) -> Similarity:
    """Least-squares similarity transform mapping src onto dst (Umeyama, 1991)."""
    w = np.ones(len(src)) if weights is None else np.asarray(weights, dtype=np.float64)
    w = w / w.sum()
    mu_s = (w[:, None] * src).sum(0)
    mu_d = (w[:, None] * dst).sum(0)
    s0, d0 = src - mu_s, dst - mu_d
    cov = (w[:, None] * d0).T @ s0
    u, sig, vt = np.linalg.svd(cov)
    d = np.ones(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        d[2] = -1
    rot = u @ np.diag(d) @ vt
    var_s = (w * (s0**2).sum(1)).sum()
    scale = float((sig * d).sum() / var_s)
    t = mu_d - scale * rot @ mu_s
    return Similarity(scale=scale, rotation=rot, translation=t)


def head_pose(to_face: Similarity) -> HeadPose:
    """Pose of the head in the camera, from the camera->canonical-face alignment."""
    r = to_face.rotation
    forward = r[2]  # canonical +z (out of the face) expressed in camera coordinates
    up = r[1]
    yaw = np.degrees(np.arctan2(forward[0], forward[2]))
    pitch = np.degrees(np.arctan2(forward[1], np.hypot(forward[0], forward[2])))
    roll = np.degrees(np.arctan2(-up[0], up[1]))
    return HeadPose(yaw=float(yaw), pitch=float(pitch), roll=float(roll))


def align_to_canonical(points: np.ndarray) -> Similarity:
    return umeyama(points[STABLE], canonical_face().positions[STABLE])


@dataclass
class ViewGeometry:
    name: str
    points: np.ndarray  # (468, 3) camera-space points
    to_face: Similarity = None  # type: ignore[assignment]


@dataclass
class FusedGeometry:
    positions: np.ndarray  # (468, 3) in the canonical frame and scale
    views: list[ViewGeometry]
    residual: float  # mean per-landmark disagreement between views, canonical units


def fuse_views(views: list[ViewGeometry], iterations: int = 3, depth_sigma: float = 3.0) -> FusedGeometry:
    """
    Fuses per-view MediaPipe landmark sets into one face shape.

    Each view measures the two image-plane components of every landmark well and its
    depth poorly (depth is predicted from a single image). We therefore solve, per
    landmark, a weighted least-squares problem with an anisotropic information matrix
    per view: side views pin down the depth that the frontal view can only guess.
    Views are weighted per landmark by how directly the surface faces that camera.
    """
    front = views[0]
    fused = align_to_canonical(front.points).apply(front.points)
    tris = canonical_face().triangles
    info_local = np.diag([1.0, 1.0, 1.0 / depth_sigma**2])

    for _ in range(iterations):
        for view in views:
            view.to_face = umeyama(view.points[STABLE], fused[STABLE])
        normals = vertex_normals(fused, tris)
        info_sum = np.zeros((LANDMARK_COUNT, 3, 3))
        rhs = np.zeros((LANDMARK_COUNT, 3))
        for view in views:
            rot = view.to_face.rotation
            aligned = view.to_face.apply(view.points)
            info = rot @ info_local @ rot.T  # information matrix in the face frame
            facing = np.clip(normals @ rot[:, 2], 0.0, 1.0)
            w = 0.05 + facing**2
            info_sum += w[:, None, None] * info
            rhs += w[:, None] * (aligned @ info.T)
        fused = np.linalg.solve(info_sum, rhs[..., None])[..., 0]

    # Express the result in the canonical frame and scale.
    final = align_to_canonical(fused)
    fused = final.apply(fused)
    for view in views:
        view.to_face = umeyama(view.points[STABLE], fused[STABLE])
    residual = float(np.mean([np.linalg.norm(v.to_face.apply(v.points) - fused, axis=1).mean() for v in views]))
    return FusedGeometry(positions=fused, views=views, residual=residual)
