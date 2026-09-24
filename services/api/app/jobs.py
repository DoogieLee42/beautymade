"""
Background reconstruction jobs.

MVP: an in-process thread pool with job state persisted on the Scan row, so the API
can report progress and re-queue unfinished work after a restart. In production this
becomes a queue (e.g. Cloud Tasks / SQS / Celery) feeding GPU-capable workers that run
the same `run_reconstruction` function.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from .models import FaceModel, Scan, new_id, utcnow

if TYPE_CHECKING:
    from .db import Database
    from .storage import LocalStorage

log = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, workers: int, inline: bool = False) -> None:
        self.inline = inline
        self._pool = None if inline else ThreadPoolExecutor(max_workers=workers, thread_name_prefix="reconstruct")

    def submit(self, fn: Callable[..., None], *args: object) -> None:
        if self._pool is None:
            fn(*args)
        else:
            self._pool.submit(_log_errors(fn), *args)

    def shutdown(self) -> None:
        if self._pool is not None:
            self._pool.shutdown(wait=False, cancel_futures=True)


def _log_errors(fn: Callable[..., None]) -> Callable[..., None]:
    def wrapper(*args: object) -> None:
        try:
            fn(*args)
        except Exception:  # pragma: no cover - defensive; job functions record their own failures
            log.exception("background job crashed")

    return wrapper


def face_prefix(user_id: str, face_id: str) -> str:
    return f"users/{user_id}/faces/{face_id}"


def run_reconstruction(db: Database, storage: LocalStorage, scan_id: str) -> None:
    from .reconstruction.pipeline import ReconstructionError, reconstruct
    from .reconstruction.quality import decode_image

    with db.session() as session:
        scan = session.get(Scan, scan_id)
        if scan is None or scan.status not in ("queued", "processing"):
            return
        scan.status, scan.progress, scan.stage = "processing", 0.02, "analyzing"
        session.commit()
        photos = {p.view: storage.get(p.storage_key) for p in scan.photos}
        user_id = scan.user_id

    lock = threading.Lock()
    last = [0.0]

    def progress(value: float, stage: str) -> None:
        now = time.monotonic()
        with lock:
            if now - last[0] < 0.25 and value < 1.0:
                return
            last[0] = now
        with db.session() as s:
            row = s.get(Scan, scan_id)
            if row is not None:
                row.progress, row.stage = round(min(value, 0.99), 3), stage
                s.commit()

    try:
        images = {view: decode_image(data) for view, data in photos.items()}
        result = reconstruct(images, progress=progress)  # type: ignore[arg-type]
    except ReconstructionError as exc:
        _fail(db, scan_id, exc.code, exc.message)
        return
    except Exception:
        log.exception("reconstruction failed for scan %s", scan_id)
        _fail(db, scan_id, "internal", "3D 얼굴을 만드는 중 문제가 생겼어요. 다시 시도해주세요.")
        return

    face_id = new_id()
    prefix = face_prefix(user_id, face_id)
    storage.put(f"{prefix}/model.json", json.dumps(result.model, separators=(",", ":")).encode())
    storage.put(f"{prefix}/albedo.jpg", result.albedo_jpg)
    storage.put(f"{prefix}/smooth.jpg", result.smooth_jpg)
    storage.put(f"{prefix}/mask.png", result.mask_png)
    storage.put(f"{prefix}/thumbnail.jpg", result.thumbnail_jpg)
    if result.eyes_jpg:
        storage.put(f"{prefix}/eyes.jpg", result.eyes_jpg)

    with db.session() as session:
        meta = {k: v for k, v in result.model.items() if k not in ("mesh",)}
        meta["stats"] = result.stats
        session.add(FaceModel(id=face_id, user_id=user_id, scan_id=scan_id, storage_prefix=prefix, meta=meta))
        scan = session.get(Scan, scan_id)
        if scan is not None:
            scan.status, scan.progress, scan.stage = "completed", 1.0, "done"
            scan.face_model_id = face_id
            scan.updated_at = utcnow()
        session.commit()
    log.info("scan %s -> face model %s in %.2fs", scan_id, face_id, result.stats.get("seconds", 0))


def _fail(db: Database, scan_id: str, code: str, message: str) -> None:
    with db.session() as session:
        scan = session.get(Scan, scan_id)
        if scan is not None:
            scan.status, scan.stage = "failed", None
            scan.error_code, scan.error_message = code, message
            session.commit()
