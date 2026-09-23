"""Per-photo checks run right after each capture, so users can retake immediately."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import cv2
import numpy as np

from .geometry import HeadPose, align_to_canonical, head_pose, to_camera_space
from .landmarker import FaceDetection, FaceLandmarker

View = Literal["front", "left", "right"]
VIEWS: tuple[View, ...] = ("front", "left", "right")

# Accepted head yaw in degrees. "left" means the user turned their head to their left (yaw > 0).
FRONT_MAX_YAW = 12.0
SIDE_YAW_RANGE = (15.0, 62.0)


@dataclass
class Issue:
    code: str
    message: str
    severity: Literal["error", "warning"] = "error"


@dataclass
class PhotoAnalysis:
    view: View
    width: int
    height: int
    issues: list[Issue] = field(default_factory=list)
    pose: HeadPose | None = None
    detection: FaceDetection | None = None
    face_box: tuple[float, float, float, float] | None = None  # normalised x, y, w, h

    @property
    def ok(self) -> bool:
        return self.detection is not None and not any(i.severity == "error" for i in self.issues)


def decode_image(data: bytes, max_side: int = 1600) -> np.ndarray:
    """Decodes JPEG/PNG bytes into RGB, applying EXIF orientation and bounding the size."""
    buf = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("unsupported or corrupt image")
    h, w = bgr.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1:
        bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def _pick_largest(faces: list[FaceDetection]) -> FaceDetection:
    def width(f: FaceDetection) -> float:
        return float(f.landmarks[:, 0].max() - f.landmarks[:, 0].min())

    return max(faces, key=width)


def analyze_photo(rgb: np.ndarray, view: View, landmarker: FaceLandmarker) -> PhotoAnalysis:
    h, w = rgb.shape[:2]
    result = PhotoAnalysis(view=view, width=w, height=h)
    faces = landmarker.detect(rgb)
    if not faces:
        result.issues.append(Issue("no_face", "얼굴을 찾지 못했어요. 얼굴이 가이드 안에 오도록 다시 찍어주세요."))
        return result

    face = _pick_largest(faces)
    result.detection = face
    if len(faces) > 1:
        result.issues.append(Issue("multiple_faces", "여러 얼굴이 보여요. 가장 큰 얼굴로 진행할게요.", "warning"))

    lm = face.landmarks
    x0, y0 = lm[:468, 0].min(), lm[:468, 1].min()
    x1, y1 = lm[:468, 0].max(), lm[:468, 1].max()
    result.face_box = (float(x0), float(y0), float(x1 - x0), float(y1 - y0))

    if x0 < 0.01 or y0 < 0.01 or x1 > 0.99 or y1 > 0.99:
        result.issues.append(Issue("face_cut_off", "얼굴이 화면 밖으로 잘렸어요. 조금 뒤로 물러나 주세요."))
    face_width_px = (x1 - x0) * w
    if face_width_px < 0.22 * min(w, h) or face_width_px < 180:
        result.issues.append(Issue("face_too_small", "얼굴이 너무 작아요. 조금 더 가까이 와주세요."))

    pose = head_pose(align_to_canonical(to_camera_space(lm, w, h)))
    result.pose = pose
    if view == "front":
        if abs(pose.yaw) > FRONT_MAX_YAW:
            result.issues.append(Issue("not_frontal", "정면을 바라봐 주세요."))
    else:
        turn = "왼쪽" if view == "left" else "오른쪽"
        yaw = pose.yaw if view == "left" else -pose.yaw  # positive = turned the requested way
        if yaw < -10:
            result.issues.append(Issue("wrong_direction", f"반대 방향이에요. 고개를 {turn}으로 돌려주세요."))
        elif yaw < SIDE_YAW_RANGE[0]:
            result.issues.append(Issue("turn_more", f"고개를 {turn}으로 조금 더 돌려주세요."))
        elif yaw > SIDE_YAW_RANGE[1]:
            result.issues.append(Issue("turn_less", "너무 많이 돌렸어요. 조금만 돌려주세요."))
    if abs(pose.pitch) > 18:
        result.issues.append(Issue("head_tilted", "고개를 숙이거나 들지 말고 수평을 맞춰주세요."))
    if abs(pose.roll) > 14:
        result.issues.append(Issue("head_rolled", "고개가 기울어졌어요. 똑바로 세워주세요."))

    # Exposure and sharpness, measured on the face only.
    fx0, fy0 = int(max(x0, 0) * w), int(max(y0, 0) * h)
    fx1, fy1 = int(min(x1, 1) * w), int(min(y1, 1) * h)
    crop = rgb[fy0:fy1, fx0:fx1]
    if crop.size:
        gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
        luminance = float(gray.mean())
        if luminance < 55:
            result.issues.append(Issue("too_dark", "너무 어두워요. 밝은 곳에서 다시 찍어주세요."))
        elif luminance > 235:
            result.issues.append(Issue("too_bright", "빛이 너무 강해요. 직사광선을 피해주세요."))
        small = cv2.resize(gray, (256, max(1, round(256 * gray.shape[0] / max(gray.shape[1], 1)))))
        sharpness = float(cv2.Laplacian(small, cv2.CV_64F).var())
        if sharpness < 12:
            result.issues.append(Issue("blurry", "사진이 흔들렸어요. 폰을 고정하고 다시 찍어주세요."))
        elif sharpness < 25:
            result.issues.append(Issue("soft", "사진이 조금 흐릿해요. 초점이 맞았는지 확인해주세요.", "warning"))

    shapes = face.blendshapes
    if view == "front" and max(shapes.get("eyeBlinkLeft", 0), shapes.get("eyeBlinkRight", 0)) > 0.6:
        result.issues.append(Issue("eyes_closed", "눈을 편하게 떠 주세요."))
    if shapes.get("jawOpen", 0) > 0.3:
        result.issues.append(Issue("mouth_open", "입을 가볍게 다물어 주세요."))
    if max(shapes.get("mouthSmileLeft", 0), shapes.get("mouthSmileRight", 0)) > 0.6:
        result.issues.append(Issue("smiling", "무표정일 때 가장 정확해요.", "warning"))
    return result
