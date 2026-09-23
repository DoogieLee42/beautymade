import math

import numpy as np

from app.reconstruction.geometry import (
    Similarity,
    ViewGeometry,
    align_to_canonical,
    fuse_views,
    head_pose,
    umeyama,
)
from app.reconstruction.texture import AtlasRaster, skin_mask
from app.reconstruction.topology import canonical_face


def _rot_y(deg: float) -> np.ndarray:
    a = math.radians(deg)
    return np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])


def test_canonical_topology() -> None:
    face = canonical_face()
    assert face.positions.shape == (468, 3)
    assert face.triangles.shape == (898, 3)
    assert len(face.oval) == 36
    assert face.positions[263, 0] > 0 > face.positions[33, 0]  # +x is the subject's left


def test_umeyama_recovers_similarity() -> None:
    src = canonical_face().positions
    true = Similarity(scale=37.0, rotation=_rot_y(20), translation=np.array([400.0, -300.0, 12.0]))
    fit = umeyama(src, true.apply(src))
    assert math.isclose(fit.scale, 37.0, rel_tol=1e-9)
    assert np.allclose(fit.rotation, true.rotation)
    assert np.allclose(fit.invert(true.apply(src)), src)


def test_head_pose_sign_convention() -> None:
    face = canonical_face().positions
    # The head turned to the subject's left: its nose points to camera +x.
    turned = face @ _rot_y(30).T * 40
    pose = head_pose(align_to_canonical(turned))
    assert math.isclose(pose.yaw, 30, abs_tol=0.5)
    assert abs(pose.pitch) < 0.5 and abs(pose.roll) < 0.5


def test_fusion_uses_side_views_for_depth() -> None:
    truth = canonical_face().positions
    # Front view: accurate image plane, badly flattened depth (like a monocular estimate).
    front = truth.copy()
    front[:, 2] *= 0.6
    views = [ViewGeometry("front", front * 30)]
    for yaw in (35, -35):
        rotated = truth @ _rot_y(yaw).T
        rotated[:, 2] *= 0.6  # each view's own depth is flattened too
        views.append(ViewGeometry("side", rotated * 30))
    fused = fuse_views(views).positions
    nose_depth_truth = truth[4, 2] - truth[234, 2]
    front_only = fuse_views([ViewGeometry("front", front * 30)]).positions
    err_front = abs((front_only[4, 2] - front_only[234, 2]) - nose_depth_truth)
    err_fused = abs((fused[4, 2] - fused[234, 2]) - nose_depth_truth)
    assert err_fused < err_front * 0.6


def test_atlas_raster_and_mask() -> None:
    raster = AtlasRaster(256)
    assert raster.coverage.mean() > 0.4
    assert np.allclose(raster.bary.sum(1), 1)
    mask = skin_mask(256)
    assert mask.dtype == np.uint8
    assert mask.max() == 255 and mask.min() == 0
