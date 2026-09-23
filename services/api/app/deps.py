from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import Settings
from .db import Database
from .jobs import JobRunner
from .models import User
from .security import decode_access_token
from .storage import LocalStorage


@dataclass
class Services:
    settings: Settings
    db: Database
    storage: LocalStorage
    jobs: JobRunner


def services(request: Request) -> Services:
    return request.app.state.services


def db_session(svc: Annotated[Services, Depends(services)]) -> Iterator[Session]:
    with svc.db.session() as session:
        yield session


_bearer = HTTPBearer(auto_error=False)


def current_user(
    svc: Annotated[Services, Depends(services)],
    db: Annotated[Session, Depends(db_session)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    user_id = decode_access_token(credentials.credentials, svc.settings.secret_key) if credentials else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요해요.")
    return user


ServicesDep = Annotated[Services, Depends(services)]
DbDep = Annotated[Session, Depends(db_session)]
UserDep = Annotated[User, Depends(current_user)]
