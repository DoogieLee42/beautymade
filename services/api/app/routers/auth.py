from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select

from ..deps import DbDep, ServicesDep, UserDep
from ..models import AiRender, FaceModel, Look, Scan, ScanPhoto, User
from ..schemas import AuthOut, LoginIn, MeOut, SignupIn, UserOut
from ..security import create_access_token, hash_password, verify_password
from .face_models import latest_face_model, summary_out

router = APIRouter(tags=["auth"])


def _auth_out(svc: ServicesDep, user: User) -> AuthOut:
    token = create_access_token(user.id, svc.settings.secret_key, svc.settings.access_token_ttl_minutes)
    return AuthOut(token=token, user=UserOut.model_validate(user))


@router.post("/auth/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, svc: ServicesDep, db: DbDep) -> AuthOut:
    if db.scalar(select(User).where(User.email == body.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 가입된 이메일이에요. 로그인해주세요.")
    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _auth_out(svc, user)


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, svc: ServicesDep, db: DbDep) -> AuthOut:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "이메일 또는 비밀번호가 맞지 않아요.")
    return _auth_out(svc, user)


@router.get("/me", response_model=MeOut)
def me(user: UserDep, svc: ServicesDep, db: DbDep) -> MeOut:
    face = latest_face_model(db, user.id)
    look_count = db.scalar(select(func.count()).select_from(Look).where(Look.user_id == user.id)) or 0
    return MeOut(
        user=UserOut.model_validate(user),
        face_model=summary_out(svc, face) if face else None,
        look_count=look_count,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user: UserDep, svc: ServicesDep, db: DbDep) -> None:
    """Deletes the account with every photo, face model and look (privacy by default)."""
    scan_ids = select(Scan.id).where(Scan.user_id == user.id)
    db.execute(delete(ScanPhoto).where(ScanPhoto.scan_id.in_(scan_ids)))
    for model in (AiRender, Look, FaceModel, Scan):
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)
    db.commit()
    svc.storage.delete_prefix(f"users/{user.id}")
