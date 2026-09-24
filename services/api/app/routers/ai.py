from __future__ import annotations

import hashlib
import json
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai_render import AiRenderError, RenderRequest, build_prompt, normalise_jpeg, provider_from_settings
from ..deps import DbDep, ServicesDep, UserDep
from ..models import AiRender, FaceModel, ScanPhoto, utcnow
from ..schemas import AiRenderIn, AiRenderOut, AiStatusOut
from .looks import _decode_thumbnail

router = APIRouter(prefix="/ai-renders", tags=["ai previews"])


def _remaining(db: Session, user_id: str, limit: int) -> int:
    since = utcnow() - timedelta(days=1)
    used = db.scalar(select(func.count()).where(AiRender.user_id == user_id, AiRender.created_at >= since)) or 0
    return max(0, limit - used)


@router.get("/status", response_model=AiStatusOut)
def ai_status(user: UserDep, svc: ServicesDep, db: DbDep) -> AiStatusOut:
    provider = provider_from_settings(svc.settings)
    return AiStatusOut(
        enabled=provider is not None,
        provider=provider.name if provider else None,
        remaining_today=_remaining(db, user.id, svc.settings.ai_daily_limit),
    )


@router.post("", response_model=AiRenderOut)
def create_ai_render(body: AiRenderIn, user: UserDep, svc: ServicesDep, db: DbDep) -> AiRenderOut:
    """Turns the edited 3D preview into a photo-like image with the user's own photo as reference."""
    provider = provider_from_settings(svc.settings)
    if provider is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI 고화질 보기가 아직 설정되지 않았어요.")
    face = db.get(FaceModel, body.face_model_id)
    if face is None or face.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "얼굴 모델을 찾을 수 없어요.")
    photo = db.scalar(select(ScanPhoto).where(ScanPhoto.scan_id == face.scan_id, ScanPhoto.view == "front"))
    if photo is None or not svc.storage.exists(photo.storage_key):
        raise HTTPException(status.HTTP_409_CONFLICT, "원본 정면 사진이 없어요. 다시 스캔해주세요.")

    values = {k: round(float(v), 2) for k, v in sorted(body.values.items()) if abs(float(v)) >= 0.005}
    fingerprint = json.dumps([face.id, values, body.angle, provider.name, provider.model], sort_keys=True)
    cache_key = hashlib.sha256(fingerprint.encode()).hexdigest()[:40]
    limit = svc.settings.ai_daily_limit
    existing = db.scalar(select(AiRender).where(AiRender.user_id == user.id, AiRender.cache_key == cache_key))
    if existing is not None and svc.storage.exists(existing.storage_key):
        return AiRenderOut(
            id=existing.id,
            url=svc.storage.url(existing.storage_key),
            cached=True,
            remaining_today=_remaining(db, user.id, limit),
        )
    if _remaining(db, user.id, limit) <= 0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "오늘 만들 수 있는 AI 이미지를 모두 사용했어요.")

    guide, _ = _decode_thumbnail(body.guide)
    request = RenderRequest(
        photo_jpg=svc.storage.get(photo.storage_key),
        guide_jpg=guide,
        prompt=build_prompt(values, body.angle),
    )
    try:
        image = normalise_jpeg(provider.render(request))
    except AiRenderError as exc:
        if exc.retryable:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "AI 이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요."
            ) from exc
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "이 조합으로는 AI 이미지를 만들 수 없어요. 값을 조금 바꿔보세요."
        ) from exc

    record = AiRender(
        user_id=user.id,
        face_model_id=face.id,
        cache_key=cache_key,
        storage_key=f"users/{user.id}/ai/{face.id}/{cache_key}.jpg",
        provider=provider.name,
    )
    svc.storage.put(record.storage_key, image)
    if existing is not None:
        db.delete(existing)
    db.add(record)
    db.commit()
    return AiRenderOut(
        id=record.id,
        url=svc.storage.url(record.storage_key),
        cached=False,
        remaining_today=_remaining(db, user.id, limit),
    )
