"""
Clean eyeball texture for the eye-opening simulations (앞트임, 뒷트임, 밑트임, 눈매교정).

The face texture paints each eye onto the surface between the lids, so moving a lid would
stretch the iris. The app instead draws the eye openings from this texture, looked up by
position in a frame that stays put with the eyeball: when a lid opens further, the parts of
the eye it used to cover come into view. Those parts are rebuilt from the photo: the iris is
completed around its centre, the white of the eye is extended outwards, and past the inner
corner it turns into the pink caruncle. The shadow the lids and lashes cast is left out here;
the app shades the eyeball along wherever the lids end up.

Atlas: the person's right eye in the left half, their left eye in the right half. Each half
covers EYE_MM around the iris centre, level with the line between the pupils.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import cv2
import numpy as np

from .eyes import IRIS_DIAMETER_MM, LEFT_EYE, RIGHT_EYE, EyeFrame, EyeIndices
from .texture import pull_push

EYE_MM = (44.0, 22.0)  # width x height around each iris centre
PX_PER_MM = 512 / EYE_MM[0]  # ~11.6 px/mm, finer than the photo so nothing is lost
LID_MARGIN_MM = 0.6  # photo pixels this close to a lid show lashes and lid shadow, not eyeball
CARUNCLE_MM = 2.0

# model-space points -> front-photo pixels (the front view's projection)
ToPhoto = Callable[[np.ndarray], np.ndarray]


@dataclass
class EyeTexture:
    image: np.ndarray  # (H, 2W, 3) uint8 RGB
    # Per eye, atlas uv of a model-space point p: u = U . (p, 1), v = V . (p, 1) (v up, like the face uvs).
    maps: dict[str, dict[str, list[float]]]

    @property
    def size(self) -> tuple[int, int]:
        return self.image.shape[1], self.image.shape[0]


def build_eye_texture(photo: np.ndarray, frame: EyeFrame, model_points: np.ndarray, to_photo: ToPhoto) -> EyeTexture:
    """`model_points`: the face landmarks in model space; `to_photo`: the front view's projection."""
    w, h = round(EYE_MM[0] * PX_PER_MM), round(EYE_MM[1] * PX_PER_MM)
    halves = []
    maps = {}
    for half, (name, eye) in enumerate((("right", RIGHT_EYE), ("left", LEFT_EYE))):
        halves.append(_eyeball(photo, frame, eye, w, h))
        maps[name] = _uv_map(frame, eye, model_points, to_photo, half, w, h)
    return EyeTexture(image=np.concatenate(halves, axis=1), maps=maps)


def _to_texture(frame: EyeFrame, eye: EyeIndices, photo_px: np.ndarray, w: int, h: int) -> np.ndarray:
    """Photo pixels -> pixels of this eye's half of the atlas (iris centre in the middle)."""
    d = photo_px - frame.px[eye.iris]
    mm = np.stack([d @ frame.across, d @ frame.down], axis=-1) * frame.mm_per_px
    return mm * PX_PER_MM + [w / 2, h / 2]


def _eyeball(photo: np.ndarray, frame: EyeFrame, eye: EyeIndices, w: int, h: int) -> np.ndarray:
    # 1. The photo around the eye, turned level and resampled at a fixed scale.
    xs = (np.arange(w) + 0.5 - w / 2) / PX_PER_MM
    ys = (np.arange(h) + 0.5 - h / 2) / PX_PER_MM
    gx, gy = np.meshgrid(xs, ys)
    centre = frame.px[eye.iris]
    per_mm = 1 / frame.mm_per_px
    map_x = centre[0] + (gx * frame.across[0] + gy * frame.down[0]) * per_mm
    map_y = centre[1] + (gx * frame.across[1] + gy * frame.down[1]) * per_mm
    img = cv2.remap(
        photo, map_x.astype(np.float32), map_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
    )

    # 2. What the photo really shows of the eyeball: the lid opening less a thin band along the lids.
    lid = _to_texture(frame, eye, frame.px[eye.loop], w, h)
    opening = np.zeros((h, w), np.uint8)
    cv2.fillPoly(opening, [np.round(lid * 4).astype(np.int32)], 255, cv2.LINE_AA, 2)
    k = 2 * round(LID_MARGIN_MM * PX_PER_MM) + 1
    seen = cv2.erode(opening, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 127

    # 3. The iris, completed around its centre, out to where the photo shows it meeting the white.
    radius = _iris_edge(img, seen, (w / 2, h / 2), IRIS_DIAMETER_MM / 2 * PX_PER_MM)
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.hypot(xx + 0.5 - w / 2, yy + 0.5 - h / 2)
    iris = dist <= radius
    iris_img = _complete_iris(img, seen & iris, (w / 2, h / 2), radius)

    # 4. The white of the eye: extended from the white the photo shows (never from the iris) ...
    white_seen = seen & (dist > radius + 0.8 * PX_PER_MM)
    white = np.median(img[white_seen], axis=0) if white_seen.sum() > 20 else np.array([215.0, 205.0, 200.0])
    sclera = pull_push(img, white_seen, white)
    # ... with the iris laid over it, its edge softened like the limbus in a photo.
    alpha = np.clip((radius - dist) / (0.3 * PX_PER_MM) + 0.5, 0, 1)[..., None]
    hidden = sclera * (1 - alpha) + iris_img.astype(np.float32) * alpha
    img = np.where(seen[..., None], img, hidden.round().astype(np.uint8))

    # 5. Past the inner corner the eyeball gives way to the pink caruncle.
    return _caruncle(img, seen | iris, seen, lid[0], white, w)


def _iris_edge(img: np.ndarray, seen: np.ndarray, centre: tuple[float, float], guess: float) -> float:
    """
    Radius where the iris meets the white, found on its left and right sides (the lids rarely
    reach there): the steepest dark-to-light step along each ray. The landmarks' iris is only
    approximate, and a disc drawn too large would rebuild white into the iris.
    """
    size = int(np.ceil(guess * 1.3))
    luma = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    polar = cv2.warpPolar(luma, (size, 360), centre, size, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR)
    ok = cv2.warpPolar(
        seen.astype(np.uint8) * 255, (size, 360), centre, size, cv2.WARP_POLAR_LINEAR | cv2.INTER_NEAREST
    )
    lo, hi = int(0.6 * guess), min(size - 3, int(1.2 * guess))
    kernel = np.array([1, 4, 6, 4, 1], np.float32) / 16
    edges = []
    for angle in [*range(0, 36), *range(145, 216), *range(325, 360)]:
        if not (ok[angle, lo : hi + 2] > 127).all():
            continue
        step = np.diff(np.convolve(polar[angle], kernel, mode="same"))[lo:hi]
        if step.max() > 2:
            edges.append(lo + int(np.argmax(step)) + 0.5)
    return float(np.median(edges)) if len(edges) >= 8 else guess


def _complete_iris(img: np.ndarray, seen: np.ndarray, centre: tuple[float, float], radius: float) -> np.ndarray:
    """
    The iris with its hidden part filled in, going round the centre: each hidden sector mirrors
    the visible iris on either side of it, so the radial pattern carries on.
    """
    size = int(np.ceil(radius * 1.1))  # sample a little past the edge so the limbus stays inside
    polar = cv2.warpPolar(img, (size, 360), centre, size, cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR).astype(np.float32)
    ok = (
        cv2.warpPolar(seen.astype(np.uint8) * 255, (size, 360), centre, size, cv2.WARP_POLAR_LINEAR | cv2.INTER_NEAREST)
        > 127
    )
    if ok[:, : int(radius)].mean() < 0.1:
        # Hardly any iris to go on (lids nearly closed): its mean colour will do.
        colour = img[seen].mean(axis=0) if seen.any() else polar.reshape(-1, 3).mean(axis=0)
        return np.broadcast_to(colour.astype(np.uint8), img.shape).copy()
    filled = polar.copy()
    for col in range(size):
        visible = np.flatnonzero(ok[:, col])
        if len(visible) in (0, 360):
            if not len(visible) and col:
                filled[:, col] = filled[:, col - 1]
            continue
        missing = np.flatnonzero(~ok[:, col])
        around = np.concatenate([visible - 360, visible, visible + 360])
        at = np.searchsorted(around, missing)
        before, after = around[at - 1], around[at]
        # Mirror across the nearest visible angle on each side (or take that angle itself).
        a = np.where(ok[(2 * before - missing) % 360, col], (2 * before - missing) % 360, before % 360)
        b = np.where(ok[(2 * after - missing) % 360, col], (2 * after - missing) % 360, after % 360)
        t = ((missing - before) / np.maximum(after - before, 1))[:, None]
        filled[missing, col] = (1 - t) * polar[a, col] + t * polar[b, col]
    return cv2.warpPolar(
        filled.round().astype(np.uint8),
        (img.shape[1], img.shape[0]),
        centre,
        size,
        cv2.WARP_POLAR_LINEAR | cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR,
    )


def _caruncle(
    img: np.ndarray, known: np.ndarray, seen: np.ndarray, inner: np.ndarray, white: np.ndarray, w: int
) -> np.ndarray:
    towards_nose = 1.0 if inner[0] > w / 2 else -1.0
    h = img.shape[0]
    xx, yy = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    beyond = (xx - inner[0]) * towards_nose / PX_PER_MM  # mm past the inner corner
    level = (yy - inner[1]) / PX_PER_MM
    # Its colour: the reddest part of what the photo shows at the corner, else a pink from the white.
    rgb = img.astype(np.float32)
    redness = rgb[..., 0] - (rgb[..., 1] + rgb[..., 2]) / 2
    corner = seen & (np.hypot(beyond, level) < CARUNCLE_MM)
    colour = np.asarray(white, np.float32) * [0.92, 0.58, 0.58]
    if corner.sum() >= 12:
        reddest = corner & (redness >= np.percentile(redness[corner], 80))
        if redness[reddest].mean() > 35:  # the photo shows real caruncle, not just lid skin
            colour = (colour + rgb[reddest].mean(axis=0)) / 2
    t = np.clip((beyond + 1.5) / 1.5, 0, 1)  # from 1.5 mm inside the corner, fully pink at it
    weight = t * t * (3 - 2 * t) * np.exp(-((level / 3.0) ** 2)) * ~known
    return (rgb * (1 - weight[..., None]) + colour * weight[..., None]).round().astype(np.uint8)


def _uv_map(
    frame: EyeFrame, eye: EyeIndices, model_points: np.ndarray, to_photo: ToPhoto, half: int, w: int, h: int
) -> dict[str, list[float]]:
    """The affine map from model space to this eye's atlas uv."""
    # The front view's projection lands a little off the detected lids; correct it around this eye.
    ids = eye.loop
    projected = to_photo(model_points[ids])
    correction, *_ = np.linalg.lstsq(np.hstack([projected, np.ones((len(ids), 1))]), frame.px[ids], rcond=None)
    # Everything on the way is affine, so four independent points around the eye fix the map.
    samples = model_points[ids].mean(axis=0) + np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5]])
    photo = np.hstack([to_photo(samples), np.ones((len(samples), 1))]) @ correction
    tex = _to_texture(frame, eye, photo, w, h) + [half * w, 0]
    uv = np.stack([tex[:, 0] / (2 * w), 1 - tex[:, 1] / h], axis=1)
    m, *_ = np.linalg.lstsq(np.hstack([samples, np.ones((len(samples), 1))]), uv, rcond=None)
    return {"u": [round(float(x), 8) for x in m[:, 0]], "v": [round(float(x), 8) for x in m[:, 1]]}
