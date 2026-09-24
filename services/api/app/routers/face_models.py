from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..deps import DbDep, Services, ServicesDep, UserDep
from ..models import AiRender, FaceModel, Look, Scan
from ..schemas import FaceModelOut, FaceModelSummaryOut, HeadShellOut, MeshOut, TexturesOut

router = APIRouter(prefix="/face-models", tags=["face models"])


def latest_face_model(db: Session, user_id: str) -> FaceModel | None:
    return db.scalar(
        select(FaceModel).where(FaceModel.user_id == user_id).order_by(FaceModel.created_at.desc()).limit(1)
    )


def summary_out(svc: Services, face: FaceModel) -> FaceModelSummaryOut:
    return FaceModelSummaryOut(
        id=face.id,
        created_at=face.created_at,
        thumbnail_url=svc.storage.url(f"{face.storage_prefix}/thumbnail.jpg"),
    )


def full_out(svc: Services, face: FaceModel) -> FaceModelOut:
    storage, prefix = svc.storage, face.storage_prefix
    model = json.loads(storage.get(f"{prefix}/model.json"))
    mesh = model["mesh"]
    return FaceModelOut(
        id=face.id,
        created_at=face.created_at,
        thumbnail_url=storage.url(f"{prefix}/thumbnail.jpg"),
        mesh=MeshOut(
            positions=mesh["positions"],
            uvs=mesh["uvs"],
            indices=mesh["indices"],
            landmark_count=mesh["landmarkCount"],
            head=HeadShellOut.model_validate(mesh["head"]) if mesh.get("head") else None,
        ),
        textures=TexturesOut(
            albedo=storage.url(f"{prefix}/albedo.jpg"),
            smooth=storage.url(f"{prefix}/smooth.jpg"),
            mask=storage.url(f"{prefix}/mask.png"),
            eyes=storage.url(f"{prefix}/eyes.jpg") if model.get("eyeTexture") else None,
        ),
        atlas_size=model.get("atlasSize", 1024),
        skin_tone=model.get("skinTone", [0.8, 0.65, 0.58]),
        views=model.get("views", {}),
        quality=model.get("quality", {}),
        eyes=model.get("eyes"),
        eye_texture=model.get("eyeTexture"),
    )


def _owned(db: Session, user_id: str, face_id: str) -> FaceModel:
    face = db.get(FaceModel, face_id)
    if face is None or face.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "얼굴 모델을 찾을 수 없어요.")
    return face


@router.get("/current", response_model=FaceModelOut)
def current(user: UserDep, svc: ServicesDep, db: DbDep) -> FaceModelOut:
    face = latest_face_model(db, user.id)
    if face is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아직 스캔한 얼굴이 없어요.")
    return full_out(svc, face)


@router.get("/{face_id}", response_model=FaceModelOut)
def get_face_model(face_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> FaceModelOut:
    return full_out(svc, _owned(db, user.id, face_id))


@router.delete("/{face_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_face_model(face_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> None:
    """Deletes a face model, its textures, the looks made on it and the scan photos it came from."""
    face = _owned(db, user.id, face_id)
    db.execute(delete(Look).where(Look.user_id == user.id, Look.face_model_id == face.id))
    db.execute(delete(AiRender).where(AiRender.user_id == user.id, AiRender.face_model_id == face.id))
    scan = db.get(Scan, face.scan_id)
    if scan is not None and scan.user_id == user.id:
        db.delete(scan)
    db.delete(face)
    db.commit()
    svc.storage.delete_prefix(face.storage_prefix)
    svc.storage.delete_prefix(f"users/{user.id}/looks/{face.id}")
    svc.storage.delete_prefix(f"users/{user.id}/scans/{face.scan_id}")
    svc.storage.delete_prefix(f"users/{user.id}/ai/{face.id}")
