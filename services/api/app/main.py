from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .config import DEV_SECRET, Settings, get_settings
from .db import Database
from .deps import Services
from .jobs import JobRunner, run_reconstruction
from .models import Scan
from .routers import ai, auth, face_models, files, looks, scans
from .storage import LocalStorage

log = logging.getLogger("beautymade")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    if settings.secret_key == DEV_SECRET:
        log.warning("BM_SECRET_KEY is not set; using the development secret. Never do this in production.")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        svc: Services = app.state.services
        svc.db.create_all()
        _requeue_unfinished(svc)
        if not settings.inline_jobs:
            threading.Thread(target=_warm_up, daemon=True).start()
        yield
        svc.jobs.shutdown()

    app = FastAPI(
        title="BeautyMade API",
        version="0.1.0",
        description="Accounts, face scans, 3D face reconstruction and saved looks.",
        lifespan=lifespan,
    )
    app.state.services = Services(
        settings=settings,
        db=Database(settings.database_url),
        storage=LocalStorage(settings.storage_dir, settings.secret_key, settings.file_url_ttl_seconds),
        jobs=JobRunner(settings.worker_threads, inline=settings.inline_jobs),
    )

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Surface the first human-readable message; keep the details for debugging.
        first = exc.errors()[0] if exc.errors() else {}
        message = str(first.get("msg", "입력값을 확인해주세요.")).removeprefix("Value error, ")
        return JSONResponse(status_code=422, content={"detail": message, "errors": jsonable_encoder(exc.errors())})

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for module in (auth, scans, face_models, looks, files, ai):
        app.include_router(module.router)
    return app


def _requeue_unfinished(svc: Services) -> None:
    with svc.db.session() as session:
        pending = session.scalars(select(Scan.id).where(Scan.status.in_(("queued", "processing")))).all()
    for scan_id in pending:
        log.info("re-queueing scan %s", scan_id)
        svc.jobs.submit(run_reconstruction, svc.db, svc.storage, scan_id)


def _warm_up() -> None:
    """Loads (and on first run downloads) the face landmarker so the first capture is fast."""
    try:
        from .reconstruction.landmarker import shared_landmarker

        shared_landmarker()
    except Exception:  # pragma: no cover
        log.exception("face landmarker warm-up failed")


app = create_app()
