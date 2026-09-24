"""API request/response models. JSON uses camelCase to match the TypeScript client."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CONTROL_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9]{0,39}$")


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# -- auth ------------------------------------------------------------------------------------


class SignupIn(Schema):
    email: str = Field(max_length=320)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=40)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("올바른 이메일 주소를 입력해주세요.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("이름을 입력해주세요.")
        return v


class LoginIn(Schema):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(Schema):
    id: str
    email: str
    name: str
    created_at: datetime


class AuthOut(Schema):
    token: str
    user: UserOut


# -- scans -----------------------------------------------------------------------------------

ViewName = Literal["front", "left", "right"]


class IssueOut(Schema):
    code: str
    message: str
    severity: Literal["error", "warning"]


class PoseOut(Schema):
    yaw: float
    pitch: float
    roll: float


class ScanPhotoOut(Schema):
    view: ViewName
    ok: bool
    issues: list[IssueOut]
    pose: PoseOut | None
    url: str
    width: int
    height: int


class ErrorOut(Schema):
    code: str
    message: str


class ScanOut(Schema):
    id: str
    status: Literal["capturing", "queued", "processing", "completed", "failed"]
    progress: float
    stage: str | None
    error: ErrorOut | None
    photos: list[ScanPhotoOut]
    face_model_id: str | None
    created_at: datetime


# -- face models -----------------------------------------------------------------------------


class HeadShellOut(Schema):
    """How the app stitches the face to the head shell (see app/reconstruction/head.py)."""

    oval: list[int]
    rim: list[int]
    ring_uvs: list[float]
    weld: list[int]


class MeshOut(Schema):
    positions: list[float]
    uvs: list[float]
    indices: list[int]
    landmark_count: int
    head: HeadShellOut | None = None


class TexturesOut(Schema):
    albedo: str
    smooth: str
    mask: str
    eyes: str | None = None  # the clean eyeball atlas (see app/reconstruction/eyeball.py)


class EyeMapOut(Schema):
    u: list[float]
    v: list[float]


class EyeTextureOut(Schema):
    """Where a model-space point p falls in the eyeball atlas: u = U . (p, 1), v = V . (p, 1)."""

    width: int
    height: int
    right: EyeMapOut
    left: EyeMapOut


class EyeMeasurementsOut(Schema):
    width_mm: float
    height_mm: float
    tilt_deg: float
    mrd1_mm: float
    mrd2_mm: float


class EyeAnalysisOut(Schema):
    """Estimated from the front photo, with the iris width as the ruler (see app/reconstruction/eyes.py)."""

    iris_diameter_mm: float
    right: EyeMeasurementsOut
    left: EyeMeasurementsOut
    intercanthal_mm: float
    interpupillary_mm: float
    outer_canthal_mm: float | None = None  # missing on the first models with eye measurements
    intercanthal_ratio: float


class FaceModelSummaryOut(Schema):
    id: str
    created_at: datetime
    thumbnail_url: str


class FaceModelOut(FaceModelSummaryOut):
    mesh: MeshOut
    textures: TexturesOut
    atlas_size: int
    skin_tone: list[float]
    views: dict[str, dict[str, float]]
    quality: dict
    # Missing on models made before eye measurements existed, or when they weren't reliable.
    eyes: EyeAnalysisOut | None = None
    eye_texture: EyeTextureOut | None = None


class MeOut(Schema):
    user: UserOut
    face_model: FaceModelSummaryOut | None
    look_count: int


# -- looks -----------------------------------------------------------------------------------


def _check_values(values: dict[str, float]) -> dict[str, float]:
    if len(values) > 64:
        raise ValueError("too many values")
    clean: dict[str, float] = {}
    for key, value in values.items():
        if not _CONTROL_ID_RE.match(key):
            raise ValueError(f"invalid control id: {key}")
        if not -1.0 <= value <= 1.0:
            raise ValueError(f"value out of range for {key}")
        if value != 0:
            clean[key] = round(float(value), 3)
    return clean


class LookIn(Schema):
    name: str = Field(min_length=1, max_length=60)
    face_model_id: str
    values: dict[str, float]
    preset_id: str | None = Field(default=None, max_length=40)
    engine_version: int = Field(default=1, ge=1)
    # Snapshot of the 3D view as a data URL or bare base64 JPEG/PNG.
    thumbnail: str | None = Field(default=None, max_length=3_000_000)

    @field_validator("values")
    @classmethod
    def _values(cls, v: dict[str, float]) -> dict[str, float]:
        return _check_values(v)


class LookPatch(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    values: dict[str, float] | None = None
    preset_id: str | None = Field(default=None, max_length=40)
    thumbnail: str | None = Field(default=None, max_length=3_000_000)

    @field_validator("values")
    @classmethod
    def _values(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        return None if v is None else _check_values(v)


class LookOut(Schema):
    id: str
    name: str
    face_model_id: str
    values: dict[str, float]
    preset_id: str | None
    engine_version: int
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime


# -- AI previews -----------------------------------------------------------------------------


class AiStatusOut(Schema):
    enabled: bool
    provider: str | None
    remaining_today: int


class AiRenderIn(Schema):
    face_model_id: str
    values: dict[str, float] = Field(default_factory=dict)
    angle: Literal["front", "left", "right", "custom"] = "front"
    # JPEG/PNG data URL of the edited 3D preview at the wanted angle.
    guide: str = Field(max_length=4_000_000)


class AiRenderOut(Schema):
    id: str
    url: str
    cached: bool
    remaining_today: int
