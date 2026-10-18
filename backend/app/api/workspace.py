from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_personal_workspace
from app.core.config import settings
from app.core.responses import success
from app.db.session import get_db
from app.models import Attachment, User, Workspace

router = APIRouter(prefix="/workspace", tags=["workspace"])


class WorkspacePreferencePatch(BaseModel):
    unfiled_name: str = Field(min_length=1, max_length=160)


def storage_data(db: Session, user: User) -> dict[str, int | str]:
    used = int(
        db.scalar(
            select(func.coalesce(func.sum(Attachment.size_bytes), 0)).where(
                Attachment.uploader_id == user.id
            )
        )
        or 0
    )
    quota = int(user.storage_quota_bytes or settings.default_user_storage_quota_bytes)
    return {
        "plan": user.plan,
        "used_bytes": used,
        "quota_bytes": quota,
        "remaining_bytes": max(0, quota - used),
        "free_pool_cap_bytes": int(settings.free_storage_global_cap_bytes),
    }


def workspace_data(workspace: Workspace, db: Session, user: User) -> dict[str, object]:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "kind": workspace.kind,
        "unfiled_name": workspace.unfiled_name,
        "storage": storage_data(db, user),
    }


@router.get("")
def get_workspace(
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return success(workspace_data(workspace, db, user), request=request)


@router.patch("")
def update_workspace(
    payload: WorkspacePreferencePatch,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    workspace.unfiled_name = payload.unfiled_name.strip() or "未归档"
    db.commit()
    db.refresh(workspace)
    return success(workspace_data(workspace, db, user), request=request)
