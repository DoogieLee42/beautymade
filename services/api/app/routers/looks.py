from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import DbDep, Services, ServicesDep, UserDep
from ..models import FaceModel, Look, new_id, utcnow
from ..schemas import LookIn, LookOut, LookPatch

router = APIRouter(prefix="/looks", tags=["looks"])

_MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG": "png"}


def look_out(svc: Services, look: Look) -> LookOut:
    return LookOut(
        id=look.id,
        name=look.name,
        face_model_id=look.face_model_id,
        values=look.values or {},
        preset_id=look.preset_id,
        engine_version=look.engine_version,
        thumbnail_url=svc.storage.url(look.thumbnail_key) if look.thumbnail_key else None,
        created_at=look.created_at,
        updated_at=look.updated_at,
    )


def _decode_thumbnail(data: str) -> tuple[bytes, str]:
    if data.startswith("data:"):
        data = data.split(",", 1)[-1]
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "썸네일 형식이 올바르지 않아요.") from exc
    ext = next((e for magic, e in _MAGIC.items() if raw.startswith(magic)), None)
    if ext is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "썸네일은 JPG 또는 PNG여야 해요.")
    return raw, ext


def _store_thumbnail(svc: Services, user_id: str, look: Look, data: str) -> None:
    raw, ext = _decode_thumbnail(data)
    if look.thumbnail_key:
        svc.storage.delete_prefix(look.thumbnail_key)
    # A fresh key per upload keeps signed URLs cache-safe.
    key = f"users/{user_id}/looks/{look.face_model_id}/{look.id}-{new_id()[:8]}.{ext}"
    svc.storage.put(key, raw)
    look.thumbnail_key = key


def _owned(db: Session, user_id: str, look_id: str) -> Look:
    look = db.get(Look, look_id)
    if look is None or look.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "저장된 룩을 찾을 수 없어요.")
    return look


@router.get("", response_model=list[LookOut])
def list_looks(user: UserDep, svc: ServicesDep, db: DbDep, face_model_id: str | None = None) -> list[LookOut]:
    query = select(Look).where(Look.user_id == user.id)
    if face_model_id:
        query = query.where(Look.face_model_id == face_model_id)
    looks = db.scalars(query.order_by(Look.created_at.desc())).all()
    return [look_out(svc, look) for look in looks]


@router.post("", response_model=LookOut, status_code=status.HTTP_201_CREATED)
def create_look(body: LookIn, user: UserDep, svc: ServicesDep, db: DbDep) -> LookOut:
    face = db.get(FaceModel, body.face_model_id)
    if face is None or face.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "얼굴 모델을 찾을 수 없어요.")
    look = Look(
        user_id=user.id,
        face_model_id=face.id,
        name=body.name.strip(),
        values=body.values,
        preset_id=body.preset_id,
        engine_version=body.engine_version,
    )
    db.add(look)
    db.flush()
    if body.thumbnail:
        _store_thumbnail(svc, user.id, look, body.thumbnail)
    db.commit()
    return look_out(svc, look)


@router.get("/{look_id}", response_model=LookOut)
def get_look(look_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> LookOut:
    return look_out(svc, _owned(db, user.id, look_id))


@router.patch("/{look_id}", response_model=LookOut)
def update_look(look_id: str, body: LookPatch, user: UserDep, svc: ServicesDep, db: DbDep) -> LookOut:
    look = _owned(db, user.id, look_id)
    if body.name is not None:
        look.name = body.name.strip()
    if body.values is not None:
        look.values = body.values
    if "preset_id" in body.model_fields_set:
        look.preset_id = body.preset_id
    if body.thumbnail:
        _store_thumbnail(svc, user.id, look, body.thumbnail)
    look.updated_at = utcnow()
    db.commit()
    return look_out(svc, look)


@router.delete("/{look_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_look(look_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> None:
    look = _owned(db, user.id, look_id)
    if look.thumbnail_key:
        svc.storage.delete_prefix(look.thumbnail_key)
    db.delete(look)
    db.commit()
