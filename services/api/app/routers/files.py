from __future__ import annotations

import mimetypes

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from ..deps import ServicesDep

router = APIRouter(tags=["files"])


@router.get("/files/{key:path}", include_in_schema=False)
def get_file(key: str, exp: int, sig: str, svc: ServicesDep) -> FileResponse:
    """Serves stored blobs through expiring HMAC-signed URLs (no auth header needed)."""
    try:
        valid = svc.storage.verify(key, exp, sig) and svc.storage.exists(key)
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    media_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return FileResponse(
        svc.storage.file_path(key),
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=3600", "Access-Control-Allow-Origin": "*"},
    )
