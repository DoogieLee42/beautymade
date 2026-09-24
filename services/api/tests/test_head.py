from collections import Counter

import numpy as np

from app.reconstruction.head import fit_head, head_template
from app.reconstruction.topology import canonical_face


def _boundary_edges(triangles: np.ndarray) -> list[tuple[int, int]]:
    use: Counter[tuple[int, int]] = Counter()
    for a, b, c in triangles.tolist():
        for e in ((a, b), (b, c), (c, a)):
            use[(min(e), max(e))] += 1
    return [e for e, n in use.items() if n == 1]


def test_template_is_consistent() -> None:
    t = head_template()
    m = len(t.shell_positions)
    assert t.shell_triangles.max() < m
    assert len(t.oval) == 36 and t.ring_uvs.shape == (36, 2)
    assert ((t.shell_uvs >= 0) & (t.shell_uvs <= 1)).all()
    assert 0 < t.shell_hair.mean() < 1
    assert t.shell_ear.max() == 1
    # Seam duplicates really are the same point.
    assert np.allclose(t.shell_positions[t.weld[:, 0]], t.shell_positions[t.weld[:, 1]])


def test_stitched_head_is_closed_except_the_neck() -> None:
    head = fit_head(canonical_face().positions)
    welded = head.representative()[head.triangles]
    boundary = _boundary_edges(welded)
    vertices = {v for e in boundary for v in e}
    # One open loop left: the bottom of the neck, well below the chin.
    assert len(vertices) == len(boundary)
    assert head.positions[list(vertices), 1].max() < canonical_face().positions[152, 1] - 3


def test_band_faces_outwards_and_stays_thin() -> None:
    head = fit_head(canonical_face().positions)
    band = head.head_triangles[head.band_start :]
    p = head.positions
    n = np.cross(p[band[:, 1]] - p[band[:, 0]], p[band[:, 2]] - p[band[:, 0]])
    outward = p[band].mean(1) - [0.0, 1.0, -5.5]
    assert (np.einsum("ij,ij->i", n, outward) > 0).mean() > 0.9
    edge = np.linalg.norm(p[band] - p[np.roll(band, 1, axis=1)], axis=2)
    assert edge.max() < 4.0


def test_head_follows_the_face_proportions() -> None:
    canon = canonical_face().positions
    wide = canon * [1.12, 1.0, 1.0]
    narrow_head = fit_head(canon)
    wide_head = fit_head(wide)
    shell = slice(narrow_head.shell_start, narrow_head.ring_start)
    width = lambda h: np.ptp(h.positions[shell][:, 0])  # noqa: E731
    assert width(wide_head) > width(narrow_head) * 1.08
    # The face itself is untouched and the ring duplicates sit on the face border.
    assert np.allclose(wide_head.positions[:468], wide)
    assert np.allclose(wide_head.positions[wide_head.ring_start :], wide[head_template().oval])
