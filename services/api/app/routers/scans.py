from __future__ import annotations

import cv2
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..deps import DbDep, Services, ServicesDep, UserDep
from ..jobs import run_reconstruction
from ..models import Scan, ScanPhoto, utcnow
from ..reconstruction.landmarker import shared_landmarker
from ..reconstruction.quality import VIEWS, analyze_photo, decode_image
from ..schemas import ErrorOut, IssueOut, PoseOut, ScanOut, ScanPhotoOut, ViewName

router = APIRouter(prefix="/scans", tags=["scans"])


def photo_out(svc: Services, photo: ScanPhoto) -> ScanPhotoOut:
    analysis = photo.analysis or {}
    pose = analysis.get("pose")
    return ScanPhotoOut(
        view=photo.view,  # type: ignore[arg-type]
        ok=photo.ok,
        issues=[IssueOut(**i) for i in analysis.get("issues", [])],
        pose=PoseOut(**pose) if pose else None,
        url=svc.storage.url(photo.storage_key),
        width=photo.width,
        height=photo.height,
    )


def scan_out(svc: Services, scan: Scan) -> ScanOut:
    photos = sorted(scan.photos, key=lambda p: VIEWS.index(p.view))  # type: ignore[arg-type]
    error = ErrorOut(code=scan.error_code, message=scan.error_message or "") if scan.error_code else None
    return ScanOut(
        id=scan.id,
        status=scan.status,  # type: ignore[arg-type]
        progress=scan.progress,
        stage=scan.stage,
        error=error,
        photos=[photo_out(svc, p) for p in photos],
        face_model_id=scan.face_model_id,
        created_at=scan.created_at,
    )


def _owned(db: Session, user_id: str, scan_id: str) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None or scan.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "스캔을 찾을 수 없어요.")
    return scan


@router.post("", response_model=ScanOut, status_code=status.HTTP_201_CREATED)
def create_scan(user: UserDep, svc: ServicesDep, db: DbDep) -> ScanOut:
    scan = Scan(user_id=user.id)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan_out(svc, scan)


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> ScanOut:
    return scan_out(svc, _owned(db, user.id, scan_id))


@router.put("/{scan_id}/photos/{view}", response_model=ScanPhotoOut)
def upload_photo(
    scan_id: str,
    view: ViewName,
    user: UserDep,
    svc: ServicesDep,
    db: DbDep,
    photo: UploadFile = File(...),
) -> ScanPhotoOut:
    """Stores one capture and checks it right away so the app can ask for a retake."""
    scan = _owned(db, user.id, scan_id)
    if scan.status not in ("capturing", "failed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 3D 얼굴을 만들고 있는 스캔이에요.")

    limit = svc.settings.max_upload_mb * 1024 * 1024
    data = photo.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "사진 용량이 너무 커요.")
    try:
        rgb = decode_image(data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "사진을 읽을 수 없어요. JPG 또는 PNG로 올려주세요.") from exc

    analysis = analyze_photo(rgb, view, shared_landmarker())
    # Re-encode: bounded size and no EXIF metadata (e.g. GPS) is ever stored.
    ok, jpg = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "사진을 저장하지 못했어요.")
    key = f"users/{user.id}/scans/{scan.id}/{view}.jpg"
    svc.storage.put(key, jpg.tobytes())

    record = next((p for p in scan.photos if p.view == view), None)
    if record is None:
        record = ScanPhoto(scan_id=scan.id, view=view, storage_key=key, width=0, height=0)
        scan.photos.append(record)
    record.storage_key = key
    record.width, record.height = analysis.width, analysis.height
    record.ok = analysis.ok
    record.analysis = {
        "issues": [{"code": i.code, "message": i.message, "severity": i.severity} for i in analysis.issues],
        "pose": ({k: round(getattr(analysis.pose, k), 1) for k in ("yaw", "pitch", "roll")} if analysis.pose else None),
        "faceBox": analysis.face_box,
    }
    record.created_at = utcnow()
    if scan.status == "failed":
        scan.status, scan.error_code, scan.error_message = "capturing", None, None
    db.commit()
    db.refresh(record)
    return photo_out(svc, record)


@router.post("/{scan_id}/submit", response_model=ScanOut)
def submit_scan(scan_id: str, user: UserDep, svc: ServicesDep, db: DbDep) -> ScanOut:
    """Queues 3D reconstruction. Needs a usable front photo; side photos improve the result."""
    scan = _owned(db, user.id, scan_id)
    if scan.status in ("queued", "processing", "completed"):
        return scan_out(svc, scan)
    front = next((p for p in scan.photos if p.view == "front"), None)
    if front is None or not front.ok:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "정면 사진을 먼저 촬영해주세요.")
    scan.status, scan.progress, scan.stage = "queued", 0.0, "queued"
    scan.error_code = scan.error_message = None
    db.commit()
    svc.jobs.submit(run_reconstruction, svc.db, svc.storage, scan.id)
    db.refresh(scan)
    return scan_out(svc, scan)
