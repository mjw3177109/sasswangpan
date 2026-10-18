from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_personal_workspace
from app.core.responses import success
from app.db.session import get_db
from app.models import Folder, Workspace
from app.schemas.documents import FolderCreate, FolderPatch

router = APIRouter(prefix="/folders", tags=["folders"])


def folder_data(folder: Folder) -> dict[str, object]:
    return {
        "id": folder.id,
        "parent_id": folder.parent_id,
        "name": folder.name,
        "sort_order": folder.sort_order,
        "deleted_at": folder.deleted_at.isoformat() if folder.deleted_at else None,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def own_folder(db: Session, workspace: Workspace, folder_id: str) -> Folder:
    folder = db.scalar(
        select(Folder).where(Folder.id == folder_id, Folder.workspace_id == workspace.id)
    )
    if folder is None:
        raise HTTPException(404, {"code": "FOLDER_NOT_FOUND", "message": "文件夹不存在"})
    return folder


@router.get("")
def list_folders(
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folders = db.scalars(
        select(Folder)
        .where(Folder.workspace_id == workspace.id, Folder.deleted_at.is_(None))
        .order_by(Folder.sort_order, Folder.created_at)
    ).all()
    return success([folder_data(item) for item in folders], request=request)


@router.post("", status_code=201)
def create_folder(
    payload: FolderCreate,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if payload.parent_id:
        own_folder(db, workspace, payload.parent_id)
    folder = Folder(
        workspace_id=workspace.id,
        parent_id=payload.parent_id,
        name=payload.name.strip(),
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)


@router.patch("/{folder_id}")
def update_folder(
    folder_id: str,
    payload: FolderPatch,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = own_folder(db, workspace, folder_id)
    values = payload.model_dump(exclude_unset=True)
    if "parent_id" in values and values["parent_id"]:
        if values["parent_id"] == folder.id:
            raise HTTPException(
                422, {"code": "INVALID_PARENT", "message": "文件夹不能作为自己的父级"}
            )
        own_folder(db, workspace, values["parent_id"])
    for key, value in values.items():
        setattr(folder, key, value.strip() if key == "name" and value else value)
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    from app.models.core import utcnow

    folder = own_folder(db, workspace, folder_id)
    folder.deleted_at = utcnow()
    db.commit()
    return success({"deleted": True}, request=request)


@router.post("/{folder_id}/restore")
def restore_folder(
    folder_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = own_folder(db, workspace, folder_id)
    folder.deleted_at = None
    db.commit()
    db.refresh(folder)
    return success(folder_data(folder), request=request)


@router.delete("/{folder_id}/permanent")
def permanent_delete_folder(
    folder_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    folder = own_folder(db, workspace, folder_id)
    db.execute(delete(Folder).where(Folder.id == folder.id))
    db.commit()
    return success({"deleted": True, "permanent": True}, request=request)
