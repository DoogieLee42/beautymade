from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, url: str) -> None:
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        self.engine: Engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)

    def create_all(self) -> None:
        from . import models  # noqa: F401  (registers tables)

        Base.metadata.create_all(self.engine)

    def session(self) -> Session:
        return self.sessions()

    def dependency(self) -> Iterator[Session]:
        with self.sessions() as session:
            yield session
