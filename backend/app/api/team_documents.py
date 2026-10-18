import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.team_deps import team_edit_access, team_view_access
from app.core.responses import success
from app.db.session import get_db
from app.models import ActivityLog, Document, DocumentVersion, Folder
from app.models.core import utcnow
from app.schemas.team import TeamDocumentCreate, TeamDocumentPatch

router = APIRouter(prefix="/teams/{workspace_id}/documents", tags=["team-documents"])


def doc_summary(document: Document) -> dict[str, object]:
    return {
        "id": document.id,
        "workspace_id": document.workspace_id,
        "folder_id": document.folder_id,
        "author_id": document.author_id,
        "title": document.title,
        "is_favorite": document.is_favorite,
        "version": document.version,
        "deleted_at": document.deleted_at.isoformat() if document.deleted_at else None,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


def doc_data(document: Document) -> dict[str, object]:
    data = doc_summary(document)
    data["content"] = document.content
    return data


def get_team_document(db: Session, workspace_id: str, document_id: str) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.workspace_id == workspace_id)
    )
    if document is None:
        raise HTTPException(404, {"code": "DOCUMENT_NOT_FOUND", "message": "文档不存在"})
    return document


def validate_folder(db: Session, workspace_id: str, folder_id: str | None) -> None:
    if folder_id is None:
        return
    exists = db.scalar(
        select(Folder.id).where(
            Folder.id == folder_id, Folder.workspace_id == workspace_id, Folder.deleted_at.is_(None)
        )
    )
    if not exists:
        raise HTTPException(422, {"code": "INVALID_FOLDER", "message": "目标文件夹不存在"})


def log_activity(
    db: Session,
    workspace_id: str,
    actor_id: str,
    action: str,
    document_id: str,
    payload: dict[str, object] | None = None,
) -> None:
    db.add(
        ActivityLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action=action,
            entity_type="document",
            entity_id=document_id,
            payload=json.dumps(payload or {}, ensure_ascii=False),
        )
    )


@router.get("")
def list_team_documents(
    workspace_id: str,
    request: Request,
    scope: str = Query(default="all", pattern="^(all|favorites|recent|trash)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Document).where(Document.workspace_id == workspace_id)
    stmt = stmt.where(
        Document.deleted_at.is_not(None) if scope == "trash" else Document.deleted_at.is_(None)
    )
    if scope == "favorites":
        stmt = stmt.where(Document.is_favorite.is_(True))
    rows = db.scalars(stmt.order_by(Document.updated_at.desc()).limit(limit).offset(offset)).all()
    return success(
        [doc_summary(item) for item in rows],
        request=request,
        meta={"count": len(rows), "limit": limit, "offset": offset},
    )


@router.post("", status_code=201)
def create_team_document(
    workspace_id: str,
    payload: TeamDocumentCreate,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    validate_folder(db, workspace_id, payload.folder_id)
    document = Document(
        workspace_id=workspace_id,
        author_id=access.user.id,
        folder_id=payload.folder_id,
        title=payload.title.strip() or "未命名文档",
        content=payload.content,
    )
    db.add(document)
    db.flush()
    log_activity(db, workspace_id, access.user.id, "document.created", document.id)
    db.commit()
    db.refresh(document)
    return success(doc_data(document), request=request)


@router.get("/{document_id}")
def get_team_document_endpoint(
    workspace_id: str,
    document_id: str,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return success(doc_data(get_team_document(db, workspace_id, document_id)), request=request)


@router.patch("/{document_id}")
def update_team_document(
    workspace_id: str,
    document_id: str,
    payload: TeamDocumentPatch,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_team_document(db, workspace_id, document_id)
    if document.deleted_at is not None:
        raise HTTPException(409, {"code": "DOCUMENT_DELETED", "message": "回收站中的文档不能编辑"})
    if document.version != payload.version:
        raise HTTPException(
            409,
            {
                "code": "VERSION_CONFLICT",
                "message": "文档已被其他成员更新",
                "current_version": document.version,
            },
        )
    values = payload.model_dump(exclude_unset=True)
    values.pop("version", None)
    if "folder_id" in values:
        validate_folder(db, workspace_id, values["folder_id"])
    if any(key in values for key in ("title", "content")):
        db.add(
            DocumentVersion(
                document_id=document.id,
                version=document.version,
                title=document.title,
                content=document.content,
                created_by=access.user.id,
            )
        )
    for key, value in values.items():
        if key == "title" and value is not None:
            value = value.strip() or "未命名文档"
        setattr(document, key, value)
    document.version += 1
    document.updated_at = utcnow()
    log_activity(
        db,
        workspace_id,
        access.user.id,
        "document.updated",
        document.id,
        {"version": document.version},
    )
    db.commit()
    db.refresh(document)
    return success(doc_data(document), request=request)


@router.delete("/{document_id}")
def delete_team_document(
    workspace_id: str,
    document_id: str,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_team_document(db, workspace_id, document_id)
    document.deleted_at = utcnow()
    document.updated_at = utcnow()
    log_activity(db, workspace_id, access.user.id, "document.deleted", document.id)
    db.commit()
    return success({"deleted": True}, request=request)


@router.post("/{document_id}/restore")
def restore_team_document(
    workspace_id: str,
    document_id: str,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_team_document(db, workspace_id, document_id)
    document.deleted_at = None
    document.updated_at = utcnow()
    log_activity(db, workspace_id, access.user.id, "document.restored", document.id)
    db.commit()
    db.refresh(document)
    return success(doc_data(document), request=request)


@router.delete("/{document_id}/permanent")
def permanently_delete_team_document(
    workspace_id: str,
    document_id: str,
    request: Request,
    access=Depends(team_edit_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_team_document(db, workspace_id, document_id)
    log_activity(db, workspace_id, access.user.id, "document.permanently_deleted", document.id)
    db.execute(delete(Document).where(Document.id == document.id))
    db.commit()
    return success({"deleted": True, "permanent": True}, request=request)
