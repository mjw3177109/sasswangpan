import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.responses import success
from app.db.session import get_db
from app.models import Notification, User
from app.models.core import utcnow

router = APIRouter(prefix="/notifications", tags=["notifications"])


def notification_data(item: Notification) -> dict[str, object]:
    return {
        "id": item.id,
        "kind": item.kind,
        "payload": json.loads(item.payload or "{}"),
        "read_at": item.read_at.isoformat() if item.read_at else None,
        "created_at": item.created_at.isoformat(),
    }


@router.get("")
def list_notifications(
    request: Request,
    unread_only: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc()).limit(100)).all()
    return success([notification_data(item) for item in rows], request=request)


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    item = db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    if item is None:
        raise HTTPException(404, {"code": "NOTIFICATION_NOT_FOUND", "message": "通知不存在"})
    item.read_at = utcnow()
    db.commit()
    db.refresh(item)
    return success(notification_data(item), request=request)
