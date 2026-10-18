from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.team_deps import team_edit_access, team_view_access
from app.core.responses import success
from app.db.session import get_db
from app.models import Folder
from app.models.core import utcnow
from app.schemas.team import TeamFolderCreate, TeamFolderPatch

router = APIRouter(prefix="/teams/{workspace_id}/folders", tags=["team-folders"])


def folder_data(folder: Folder) -> dict[str, object]:
    return {
        "id": folder.id,
        "workspace_id": folder.workspace_id,
        "parent_id": folder.parent_id,
        "name": folder.name,
        "sort_order": folder.sort_order,
        "deleted_at": folder.deleted_at.isoformat() if folder.deleted_at else None,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def get_folder(db: Session, workspace_id: str, folder_id: str) -> Folder:
    folder = db.scalar(
        select(Folder).where(Folder.id == folder_id, Folder.workspace_id == workspace_id)
    )
    if folder is None:
        raise HTTPException(404, {"code": "FOLDER_NOT_FOUND", "message": "文件夹不存在"})
    return folder


def validate_parent(
    db: Session, workspace_id: str, parent_id: str | None, current_id: str | None = None
) -> None:
    if parent_id is None:
        return
    if current_id and parent_id == current_id:
        raise HTTPException(422, {"code": "INVALID_PARENT", "message": "文件夹不能作为自己的父级"})
    parent = db.scalar(
        select(Folder.id).where(
            Folder.id == parent_id,
            Folder.workspace_id == workspace_id,
            Folder.deleted_at.is_(None),
        )
    )
    if not parent:
        raise HTTPException(422, {"code": "INVALID_PARENT", "message": "父文件夹不存在"})


@router.get("")
def list_team_folders(
    workspace_id: str,
    request: Request,
    include_deleted: bool = False,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Folder).where(Folder.workspace_id == workspace_id)
    if not include_deleted:
        stmt = stmt.where(Folder.deleted_at.is_(None))
    rows = db.scalars(stmt.order_by(Folder.sort_order.asc(), Folder.created_at.asc())).all()
    return success([folder_data(item) for item in rows], request=request)


@router.post("", status_code=201)
def create_team_folder(
    workspace_id: str,
    payload: TeamFolderCreate,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    validate_parent(db, workspace_id, payload.parent_id)
    folder = Folder(
        workspace_id=workspace_id,
        parent_id=payload.parent_id,
        name=payload.name.strip(),
        sort_order=payload.sort_order,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)


@router.patch("/{folder_id}")
def update_team_folder(
    workspace_id: str,
    folder_id: str,
    payload: TeamFolderPatch,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = get_folder(db, workspace_id, folder_id)
    values = payload.model_dump(exclude_unset=True)
    if "parent_id" in values:
        validate_parent(db, workspace_id, values["parent_id"], folder.id)
    for key, value in values.items():
        if key == "name" and value is not None:
            value = value.strip()
        setattr(folder, key, value)
    folder.updated_at = utcnow()
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)


@router.delete("/{folder_id}")
def delete_team_folder(
    workspace_id: str,
    folder_id: str,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = get_folder(db, workspace_id, folder_id)
    folder.deleted_at = utcnow()
    folder.updated_at = utcnow()
    db.commit()
    return success({"deleted": True}, request=request)


@router.post("/{folder_id}/restore")
def restore_team_folder(
    workspace_id: str,
    folder_id: str,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = get_folder(db, workspace_id, folder_id)
    folder.deleted_at = None
    folder.updated_at = utcnow()
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)
