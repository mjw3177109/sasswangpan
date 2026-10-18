from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_personal_workspace
from app.api.documents import own_document
from app.core.config import settings
from app.core.responses import success
from app.core.storage import create_download_url, create_upload_url, object_size, remove_object
from app.db.session import get_db
from app.models import Attachment, Publication, User, Workspace

router = APIRouter(prefix="/attachments", tags=["attachments"])
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "storage" / "uploads"
LOCAL_MAX_FILE_SIZE = 20 * 1024 * 1024


class UploadIntentInput(BaseModel):
    document_id: str | None = None
    file_name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=120)
    size_bytes: int = Field(gt=0)


class UploadCompleteInput(BaseModel):
    upload_token: str = Field(min_length=20)


def attachment_data(item: Attachment) -> dict[str, object]:
    return {
        "id": item.id,
        "document_id": item.document_id,
        "file_name": item.file_name,
        "mime_type": item.mime_type,
        "size_bytes": item.size_bytes,
        "url": f"/api/attachments/{item.id}/content",
        "created_at": item.created_at.isoformat(),
    }


def own_attachment(db: Session, workspace: Workspace, attachment_id: str) -> Attachment:
    item = db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.workspace_id == workspace.id,
            Attachment.status == "ready",
        )
    )
    if item is None:
        raise HTTPException(404, {"code": "ATTACHMENT_NOT_FOUND", "message": "附件不存在"})
    return item


def user_storage_used(db: Session, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(Attachment.size_bytes), 0)).where(
                Attachment.uploader_id == user_id
            )
        )
        or 0
    )


def global_storage_used(db: Session) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(Attachment.size_bytes), 0))) or 0)


def _validate_quota(db: Session, user: User, new_size: int) -> None:
    # Serialize quota reservations on Postgres so concurrent presign requests cannot
    # intentionally race past the shared free-pool guard.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(82190617)"))

    quota = int(user.storage_quota_bytes or settings.default_user_storage_quota_bytes)
    used = user_storage_used(db, user.id)
    if used + new_size > quota:
        raise HTTPException(
            507,
            {
                "code": "USER_STORAGE_QUOTA_EXCEEDED",
                "message": "免费 20MB 空间已满，请先删除附件或提交付费扩容申请",
                "used_bytes": used,
                "quota_bytes": quota,
            },
        )

    cap = int(settings.free_storage_global_cap_bytes)
    if cap > 0:
        total_used = global_storage_used(db)
        if total_used + new_size > cap:
            raise HTTPException(
                507,
                {
                    "code": "FREE_STORAGE_POOL_EXHAUSTED",
                    "message": "免费对象存储物理池已达到保护上限，管理员需要扩容或切换存储后端",
                    "used_bytes": total_used,
                    "cap_bytes": cap,
                },
            )



def _cleanup_stale_pending(db: Session, older_than_minutes: int = 60) -> None:
    if not settings.storage_is_remote:
        return
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=older_than_minutes)
    stale = db.scalars(
        select(Attachment).where(
            Attachment.status == "pending",
            Attachment.created_at < cutoff,
        ).limit(100)
    ).all()
    if not stale:
        return
    for item in stale:
        remove_object(item.storage_key)
        db.delete(item)
    db.commit()

def _safe_file_parts(file_name: str) -> tuple[str, str]:
    original_name = Path(file_name or "attachment").name[:255] or "attachment"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name)[:180] or "attachment"
    return original_name, Path(safe_name).suffix[:16]


def _sign_upload(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    encoded = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    signature = hmac.new(
        settings.session_secret.encode(), encoded.encode(), hashlib.sha256
    ).hexdigest()
    return f"{encoded}.{signature}"


def _verify_upload(token: str) -> dict[str, object]:
    try:
        encoded, supplied = token.rsplit(".", 1)
        expected = hmac.new(
            settings.session_secret.encode(), encoded.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("bad signature")
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(
            400,
            {"code": "INVALID_UPLOAD_TOKEN", "message": "上传凭证无效或已过期"},
        ) from exc


@router.get("")
def list_attachments(
    request: Request,
    document_id: str | None = None,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Attachment).where(Attachment.workspace_id == workspace.id, Attachment.status == "ready")
    if document_id:
        own_document(db, workspace, document_id)
        stmt = stmt.where(Attachment.document_id == document_id)
    items = db.scalars(stmt.order_by(Attachment.created_at.desc())).all()
    return success([attachment_data(item) for item in items], request=request)


@router.post("/presign")
def create_attachment_upload_intent(
    payload: UploadIntentInput,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _cleanup_stale_pending(db)
    if payload.document_id:
        own_document(db, workspace, payload.document_id)
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            413,
            {
                "code": "FILE_TOO_LARGE",
                "message": f"单个附件不能超过 {settings.max_upload_bytes // (1024**3)}GB",
            },
        )
    _validate_quota(db, user, payload.size_bytes)

    # Local mode exists for development/tests. Vercel production must use direct object-storage upload.
    if not settings.storage_is_remote:
        return success(
            {
                "mode": "proxy",
                "max_file_size_bytes": min(LOCAL_MAX_FILE_SIZE, settings.max_upload_bytes),
            },
            request=request,
        )

    original_name, suffix = _safe_file_parts(payload.file_name)
    storage_key = f"{workspace.id}/{user.id}/{uuid4().hex}{suffix}"
    mime_type = payload.mime_type or "application/octet-stream"
    url = create_upload_url(storage_key, mime_type)

    # Reserve the declared bytes before returning a usable upload URL. This makes
    # the account quota and shared free-pool guard apply to in-flight uploads.
    item = Attachment(
        workspace_id=workspace.id,
        document_id=payload.document_id,
        uploader_id=user.id,
        file_name=original_name,
        mime_type=mime_type[:120],
        size_bytes=payload.size_bytes,
        storage_key=storage_key,
        status="pending",
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    expires_at = int(time.time()) + settings.storage_presign_ttl_seconds
    upload_token = _sign_upload(
        {
            "attachment_id": item.id,
            "workspace_id": workspace.id,
            "uploader_id": user.id,
            "storage_key": storage_key,
            "size_bytes": payload.size_bytes,
            "exp": expires_at,
        }
    )
    return success(
        {
            "mode": "direct",
            "upload_url": url,
            "upload_headers": {"Content-Type": mime_type},
            "upload_token": upload_token,
            "expires_in": settings.storage_presign_ttl_seconds,
        },
        request=request,
    )


@router.post("/complete", status_code=201)
def complete_attachment_upload(
    payload: UploadCompleteInput,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if not settings.storage_is_remote:
        raise HTTPException(409, {"code": "DIRECT_UPLOAD_DISABLED", "message": "当前未启用对象存储"})
    data = _verify_upload(payload.upload_token)
    if data.get("workspace_id") != workspace.id or data.get("uploader_id") != user.id:
        raise HTTPException(403, {"code": "UPLOAD_FORBIDDEN", "message": "上传凭证不属于当前用户"})
    attachment_id = str(data["attachment_id"])
    storage_key = str(data["storage_key"])
    item = db.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.workspace_id == workspace.id,
            Attachment.uploader_id == user.id,
            Attachment.storage_key == storage_key,
        )
    )
    if item is None:
        raise HTTPException(404, {"code": "UPLOAD_RESERVATION_NOT_FOUND", "message": "上传预留记录不存在"})
    if item.status == "ready":
        return success(attachment_data(item), request=request)
    if item.status != "pending":
        raise HTTPException(409, {"code": "UPLOAD_INVALID_STATE", "message": "上传状态无效"})

    expected_size = int(data["size_bytes"])
    actual_size = object_size(storage_key)
    if actual_size != expected_size:
        remove_object(storage_key)
        db.delete(item)
        db.commit()
        raise HTTPException(
            400,
            {
                "code": "UPLOAD_SIZE_MISMATCH",
                "message": "上传文件大小校验失败，请重新上传",
                "expected_bytes": expected_size,
                "actual_bytes": actual_size,
            },
        )

    item.size_bytes = actual_size
    item.status = "ready"
    db.commit()
    db.refresh(item)
    return success(attachment_data(item), request=request)


@router.post("", status_code=201)
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
    document_id: str | None = Form(default=None),
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if settings.storage_is_remote:
        raise HTTPException(
            409,
            {
                "code": "DIRECT_UPLOAD_REQUIRED",
                "message": "生产环境附件必须通过预签名 URL 直传对象存储",
            },
        )
    if document_id:
        own_document(db, workspace, document_id)
    max_size = min(LOCAL_MAX_FILE_SIZE, settings.max_upload_bytes)
    data = await file.read(max_size + 1)
    if len(data) > max_size:
        raise HTTPException(413, {"code": "FILE_TOO_LARGE", "message": "本地开发附件不能超过 20MB"})
    _validate_quota(db, user, len(data))
    original_name, suffix = _safe_file_parts(file.filename or "attachment")
    relative = Path(workspace.id) / f"{uuid4().hex}{suffix}"
    target = UPLOAD_ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    item = Attachment(
        workspace_id=workspace.id,
        document_id=document_id,
        uploader_id=user.id,
        file_name=original_name,
        mime_type=(file.content_type or "application/octet-stream")[:120],
        size_bytes=len(data),
        storage_key=relative.as_posix(),
        status="ready",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return success(attachment_data(item), request=request)


@router.get("/{attachment_id}/public-content")
def public_attachment_content(
    attachment_id: str,
    db: Session = Depends(get_db),
) -> Response:
    item = db.get(Attachment, attachment_id)
    if item is None or item.status != "ready" or item.document_id is None:
        raise HTTPException(404, {"code": "ATTACHMENT_NOT_FOUND", "message": "附件不存在"})
    publication = db.scalar(
        select(Publication).where(
            Publication.document_id == item.document_id,
            Publication.revoked_at.is_(None),
        )
    )
    if publication is None:
        raise HTTPException(404, {"code": "ATTACHMENT_NOT_PUBLIC", "message": "附件未公开"})
    if settings.storage_is_remote:
        return RedirectResponse(create_download_url(item.storage_key, item.file_name, item.mime_type), status_code=307)
    path = UPLOAD_ROOT / item.storage_key
    if not path.is_file():
        raise HTTPException(404, {"code": "ATTACHMENT_FILE_MISSING", "message": "附件文件不存在"})
    return FileResponse(path, media_type=item.mime_type, filename=item.file_name)


@router.get("/{attachment_id}/content")
def attachment_content(
    attachment_id: str,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> Response:
    item = own_attachment(db, workspace, attachment_id)
    if settings.storage_is_remote:
        return RedirectResponse(create_download_url(item.storage_key, item.file_name, item.mime_type), status_code=307)
    path = UPLOAD_ROOT / item.storage_key
    if not path.is_file():
        raise HTTPException(404, {"code": "ATTACHMENT_FILE_MISSING", "message": "附件文件不存在"})
    return FileResponse(path, media_type=item.mime_type, filename=item.file_name)


@router.delete("/{attachment_id}")
def delete_attachment(
    attachment_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = own_attachment(db, workspace, attachment_id)
    if settings.storage_is_remote:
        remove_object(item.storage_key)
    else:
        path = UPLOAD_ROOT / item.storage_key
        if path.is_file():
            path.unlink()
    db.execute(delete(Attachment).where(Attachment.id == item.id))
    db.commit()
    return success({"deleted": True}, request=request)
