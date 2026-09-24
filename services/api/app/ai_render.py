"""
AI high-resolution preview ("AI 고화질 보기").

The 3D editor is instant but stylised (no real hair, simplified ears). For the compare
and save screens we ask an image model to turn the edited 3D preview into a photo: the
user's real front photo carries identity, hair and skin; the 3D render carries the head
angle and the edited face shape; the prompt lists the changes in words.

Providers (BM_AI_PROVIDER): "gemini" (Nano Banana Pro, default when a key is set),
"openai" (GPT Image 2) and "fake" (tests / offline development).
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

from .config import Settings

log = logging.getLogger(__name__)


class AiRenderError(Exception):
    """The provider could not produce an image. `retryable` is False for refusals."""

    def __init__(self, message: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


# ------------------------------------------------------------------------------ prompt

# Wording for each control at +1 / -1 (None: the control only goes one way).
_CHANGES: dict[str, tuple[str, str | None]] = {
    "lidRaise": ("more open eyes: the upper eyelids sit higher and show more of the iris (ptosis correction)", None),
    "innerCorner": ("inner eye corners opened towards the nose, showing some pink caruncle (epicanthoplasty)", None),
    "outerCorner": ("outer eye corners extended outwards, so the eyes look longer (lateral canthoplasty)", None),
    "lowerLid": ("the outer lower eyelids set slightly lower, so the eyes look bigger (lower-lid lowering)", None),
    "aegyoSal": ("a soft, natural pretarsal roll (aegyo-sal) just under the lower lashes", None),
    "underEye": ("filled, smoother under-eye hollows (tear troughs) with less shadow under the eyes", None),
    "upperLid": ("fuller, less sunken upper eyelids", "slimmer, less puffy upper eyelids"),
    "browLift": ("upper-eyelid skin lifted towards the brows, with less hooding over the outer eyelids", None),
    "noseBridge": ("a higher, more defined nose bridge", "a lower, softer nose bridge"),
    "noseTip": ("a more projected nose tip", "a less projected nose tip"),
    "noseTipRotation": ("a slightly upturned nose tip", "a slightly downturned nose tip"),
    "alarWidth": ("wider nostrils (alar base)", "narrower nostrils (slimmer alar base)"),
    "jawline": ("a slimmer, V-shaped jawline", "a wider, more angular jawline"),
    "chinLength": ("a longer chin", "a shorter chin"),
    "chinProjection": ("a more projected, defined chin", "a less projected chin"),
    "cheekbone": ("fuller cheekbones", "reduced, narrower cheekbones"),
    "forehead": ("a fuller, rounder forehead", "a flatter forehead"),
    "temple": ("fuller temples", "hollower temples"),
    "lipVolume": ("fuller lips", "thinner lips"),
    "upperLip": ("a fuller upper lip", "a thinner upper lip"),
    "lipCorners": ("slightly lifted mouth corners", "slightly lowered mouth corners"),
    "lipWidth": ("a wider mouth", "a narrower mouth"),
    "lift": ("a lifted, firmer lower face (less sagging)", None),
    "cheekVolume": ("fuller front cheeks", "less full front cheeks"),
    "nasolabial": ("softened smile lines (nasolabial folds)", None),
    "skinSmooth": ("smoother skin texture (keep pores visible)", None),
    "skinTone": ("a brighter, more even skin tone", None),
    "skinRedness": ("less redness in the skin", None),
    "skinGlow": ("a dewy, glowing skin finish", "a matte skin finish"),
}

_ANGLES = {
    "front": "facing the camera straight on",
    "left": "turned about 40 degrees to one side (three-quarter view), exactly as in the second image",
    "right": "turned about 40 degrees to one side (three-quarter view), exactly as in the second image",
    "custom": "at exactly the head angle of the second image",
}


# Millimetres at full strength, for the controls the app measures in mm (packages/face-engine controls.ts).
_MM = {"lidRaise": 2.0, "innerCorner": 2.5, "outerCorner": 3.0, "lowerLid": 2.0}
# Double-eyelid crease height above the lashes at creaseHeight -1 / 0 / +1, in mm.
_CREASE_MM = (5.0, 7.0, 9.0)
_CREASE_LINES = {
    "in": "an in-line crease, tucked into the inner corner of the eye",
    "in-out": "an in-out line: starting inside the inner corner and widening towards the outer corner",
    "out": "an out-line crease, running parallel to the lashes from the inner corner",
}

# Controls that reshape the skin around the eyes. The eyes themselves and the brows stay as photographed.
_EYE_AREA = ("aegyoSal", "underEye", "upperLid", "browLift")
# Controls that change the eyes themselves: the eyelid crease and the shape of the eye opening.
_EYE_SHAPE = ("creaseDepth", *_MM)


def _value(values: dict[str, float], control: str) -> float:
    return float(values.get(control, 0) or 0)


def _active(values: dict[str, float], control: str) -> bool:
    return abs(_value(values, control)) >= 0.05


def _strength(v: float) -> str:
    return "very subtly" if abs(v) < 0.3 else "moderately" if abs(v) < 0.7 else "clearly"


def _crease(values: dict[str, float]) -> str:
    height, shape = _value(values, "creaseHeight"), _value(values, "creaseShape")
    low, mid, high = _CREASE_MM
    mm = mid + height * (mid - low if height < 0 else high - mid)
    line = _CREASE_LINES["in" if shape <= -1 / 3 else "out" if shape >= 1 / 3 else "in-out"]
    depth = _value(values, "creaseDepth")
    look = "a soft, natural" if depth < 0.45 else "a defined" if depth < 0.8 else "a crisp, deep"
    return f"{look} double-eyelid crease about {mm:.0f} mm above the upper lashes, as {line}"


def describe_changes(values: dict[str, float]) -> list[str]:
    lines = [_crease(values)] if _active(values, "creaseDepth") else []
    for control, (positive, negative) in _CHANGES.items():
        v = _value(values, control)
        if not _active(values, control):
            continue
        phrase = positive if v > 0 else negative
        if phrase is None:
            continue
        if control in _MM:
            phrase += f", about {abs(v) * _MM[control]:.1f} mm"
        lines.append(f"{_strength(v)} {phrase}")
    return lines


def build_prompt(values: dict[str, float], angle: str) -> str:
    changes = describe_changes(values)
    change_text = "\n".join(f"- {c}" for c in changes) if changes else "- none: show the person exactly as they are"
    if any(_active(values, c) for c in _EYE_SHAPE):
        keep = "iris colour, eyelashes, eyebrow shape and hair"
        shaped = "the nose, jawline, chin, cheeks, lips, forehead, the eye shape, eyelids and the skin around the eyes"
    elif any(_active(values, c) for c in _EYE_AREA):
        keep = "the eyes themselves (eye shape, iris colour, eyelashes), eyebrow shape and hair"
        shaped = "the nose, jawline, chin, cheeks, lips, forehead and the skin around the eyes"
    else:
        keep = "eyes, eyebrows"
        shaped = "the nose, jawline, chin, cheeks, lips and forehead"
    return f"""You are a professional portrait photographer and retoucher creating a realistic before/after preview.

Image 1 is a real photo of a person. Image 2 is a 3D preview of the SAME person's head after a planned change, \
seen from the wanted camera angle. The 3D preview has simplified hair and ears.

Create ONE photorealistic portrait photo of the person in Image 1:
- Identity: keep them unmistakably the same person - face, age, skin tone and texture, {keep}, \
hairstyle and hair colour exactly as in Image 1.
- Pose: head {_ANGLES.get(angle, _ANGLES["custom"])}; head and shoulders, face centred, neutral relaxed expression.
- Face shape: follow Image 2 for {shaped}.
- Planned changes (apply exactly these, natural and believable; change nothing else):
{change_text}
- No makeup, filters or beautification beyond the planned changes. No text or watermarks.
- Soft, even studio lighting, plain dark grey background, sharp focus, natural skin texture."""


# ------------------------------------------------------------------------------ providers


@dataclass
class RenderRequest:
    photo_jpg: bytes  # the user's front photo
    guide_jpg: bytes  # the edited 3D preview at the wanted angle
    prompt: str


class Provider(Protocol):
    name: str
    model: str

    def render(self, request: RenderRequest) -> bytes: ...


def _post(url: str, body: bytes, headers: dict[str, str], timeout: float) -> dict:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:500].decode("utf-8", "replace")
        log.warning("AI provider HTTP %s: %s", exc.code, detail)
        raise AiRenderError(f"provider error {exc.code}", retryable=exc.code >= 500 or exc.code == 429) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise AiRenderError(f"provider unreachable: {exc}") from exc


class GeminiProvider:
    """Google Gemini image model (Nano Banana Pro = gemini-3-pro-image-preview)."""

    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.api_key, self.model, self.timeout = api_key, model, timeout

    def render(self, request: RenderRequest) -> bytes:
        def image(data: bytes) -> dict:
            return {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(data).decode()}}

        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "Image 1:"},
                        image(request.photo_jpg),
                        {"text": "Image 2:"},
                        image(request.guide_jpg),
                        {"text": request.prompt},
                    ],
                }
            ],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "3:4"}},
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
        result = _post(url, json.dumps(body).encode(), headers, self.timeout)
        for candidate in result.get("candidates", []):
            for part in (candidate.get("content") or {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
        reason = (result.get("candidates") or [{}])[0].get("finishReason") or result.get("promptFeedback")
        raise AiRenderError(f"no image returned ({reason})", retryable=False)


class OpenAIProvider:
    """OpenAI image edits (GPT Image 2)."""

    name = "openai"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.api_key, self.model, self.timeout = api_key, model, timeout

    def render(self, request: RenderRequest) -> bytes:
        boundary = uuid.uuid4().hex
        fields = [("model", self.model), ("prompt", request.prompt), ("size", "1024x1536"), ("quality", "high")]
        chunks = []
        for name, value in fields:
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        for i, data in enumerate((request.photo_jpg, request.guide_jpg)):
            chunks.append(
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="image{i + 1}.jpg"\r\n'
                    "Content-Type: image/jpeg\r\n\r\n"
                ).encode()
                + data
                + b"\r\n"
            )
        chunks.append(f"--{boundary}--\r\n".encode())
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        result = _post("https://api.openai.com/v1/images/edits", b"".join(chunks), headers, self.timeout)
        data = (result.get("data") or [{}])[0].get("b64_json")
        if not data:
            raise AiRenderError("no image returned", retryable=False)
        return base64.b64decode(data)


class FakeProvider:
    """Offline stand-in: returns the 3D preview with a label (tests and local development)."""

    name = "fake"
    model = "fake"

    def render(self, request: RenderRequest) -> bytes:
        img = cv2.imdecode(np.frombuffer(request.guide_jpg, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise AiRenderError("unreadable guide image", retryable=False)
        cv2.putText(img, "AI preview (fake)", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        assert ok
        return buf.tobytes()


def provider_from_settings(settings: Settings) -> Provider | None:
    """The configured provider, or None when AI previews are not set up."""
    choice = settings.ai_provider.strip().lower()
    if not choice:
        choice = "gemini" if settings.gemini_api_key else "openai" if settings.openai_api_key else ""
    if choice == "gemini" and settings.gemini_api_key:
        return GeminiProvider(settings.gemini_api_key, settings.gemini_image_model, settings.ai_timeout_seconds)
    if choice == "openai" and settings.openai_api_key:
        return OpenAIProvider(settings.openai_api_key, settings.openai_image_model, settings.ai_timeout_seconds)
    if choice == "fake":
        return FakeProvider()
    return None


def normalise_jpeg(data: bytes, max_side: int = 1536) -> bytes:
    """Decodes any image the provider returns and re-encodes it as a bounded JPEG."""
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise AiRenderError("provider returned an unreadable image", retryable=False)
    scale = max_side / max(img.shape[:2])
    if scale < 1:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return buf.tobytes()
